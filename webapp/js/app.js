/**
 * Application entry point: loads configuration, wires the panels together and
 * owns the small amount of cross-cutting behaviour (autosave, toasts, export).
 */

import { loadConfig } from './config.js';
import { Store, createEmptyState, fromJSON, hasExamData, isExamComplete } from './model.js';
import { classifyState } from './classify.js';
import { ExamGrid } from './form.js';
import { ResultsPanel } from './results.js';
import { PatientPanel } from './patient.js';
import { LookupPanel } from './lookup-panel.js';
import {
  renderForm,
  exportPdf,
  exportPng,
  exportSvg,
  exportJson,
  uploadForm,
  applyPrintPageSize,
} from './export.js';
import { MOTOR_LEVELS, SENSORY_LEVELS } from './isncsci-data.js';

const AUTOSAVE_KEY = 'isncsci.draft';

async function main() {
  const config = await loadConfig();
  document.title = config.institutionName
    ? `ISNCSCI worksheet — ${config.institutionName}`
    : 'ISNCSCI worksheet';
  document.getElementById('institution-name').textContent =
    config.institutionName || 'ISNCSCI worksheet';
  applyPrintPageSize(config);

  const store = new Store(restoreDraft(config));

  const patient = new PatientPanel({
    store,
    root: document.querySelector('.patient'),
    config,
  });
  patient.prefillExamDateTime();

  const grid = new ExamGrid({
    store,
    body: document.getElementById('exam-grid-body'),
    keypad: document.getElementById('keypad'),
    extras: document.querySelector('.extras'),
  });

  const results = new ResultsPanel(
    document.getElementById('results-panel'),
    (cell) => grid.reveal(cell.side, cell.kind, cell.level),
  );

  const lookup = new LookupPanel({
    config,
    root: document.getElementById('lookup-region'),
    onSelect: (record) => {
      patient.applyLookupResult(record);
      patient.clearValidation();
      toast(`Loaded ${record.familyName ? record.familyName.toUpperCase() : 'patient'}`, 'ok');
    },
    onError: (message) => toast(message, 'error'),
  });
  lookup.init();

  let currentResult = classifyState(store.state);

  const repaint = () => {
    currentResult = classifyState(store.state);
    grid.refresh();
    patient.refresh();
    results.render(currentResult);
    saveDraft(store.state, config);
  };

  store.subscribe(repaint);
  repaint();

  wireActions({ store, config, patient, grid, getResult: () => currentResult });
}

/* --------------------------------------------------------------- actions */

function wireActions({ store, config, patient, grid, getResult }) {
  const dialog = document.getElementById('preview-dialog');
  const pagesContainer = document.getElementById('preview-pages');
  const warning = document.getElementById('preview-warning');
  let form = null;

  document.getElementById('action-new').addEventListener('click', () => {
    if (hasExamData(store.state) && !window.confirm(
      'Start a new exam? The values entered will be discarded.',
    )) {
      return;
    }
    clearDraft();
    store.replace(createEmptyState());
    patient.prefillExamDateTime();
    patient.clearValidation();
    toast('Started a new exam.');
  });

  document.getElementById('action-clear-exam').addEventListener('click', () => {
    if (!window.confirm('Clear all examination values? Patient details will be kept.')) {
      return;
    }
    store.update((state) => {
      for (const side of ['right', 'left']) {
        for (const level of SENSORY_LEVELS) {
          state.values[side].lightTouch[level] = '';
          state.values[side].pinPrick[level] = '';
        }
        for (const level of MOTOR_LEVELS) {
          state.values[side].motor[level] = '';
        }
        state.values[side].lowestNonKeyMuscleWithMotorFunction = '';
      }
      state.voluntaryAnalContraction = '';
      state.deepAnalPressure = '';
    });
  });

  document.getElementById('action-fill-normal').addEventListener('click', () => {
    store.update((state) => {
      for (const side of ['right', 'left']) {
        for (const level of SENSORY_LEVELS) {
          state.values[side].lightTouch[level] ||= '2';
          state.values[side].pinPrick[level] ||= '2';
        }
        for (const level of MOTOR_LEVELS) {
          state.values[side].motor[level] ||= '5';
        }
      }
      state.voluntaryAnalContraction ||= 'Yes';
      state.deepAnalPressure ||= 'Yes';
    });
    toast('Remaining entries set to normal. Review before exporting.');
  });

  const importInput = document.getElementById('import-file');
  document.getElementById('action-import').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) {
      return;
    }
    try {
      const loaded = fromJSON(JSON.parse(await file.text()));
      store.replace(loaded);
      patient.clearValidation();
      toast(`Opened ${file.name}.`, 'ok');
    } catch (error) {
      toast('That file could not be read as a saved exam.', 'error');
    }
  });

  document.getElementById('action-save-json').addEventListener('click', () => {
    exportJson(store.state);
  });

  document.getElementById('action-preview').addEventListener('click', () => {
    const identification = patient.validate();
    if (!identification.ok) {
      patient.showValidation();
      toast(`Patient identification incomplete: ${identification.missing.join(', ')}.`, 'error');
      return;
    }

    const result = getResult();
    if (!isExamComplete(store.state)) {
      const missing = result.missing.cells[0];
      toast('The exam must be complete before it can be exported.', 'error');
      if (missing) {
        grid.reveal(missing.side, missing.kind, missing.level);
      }
      return;
    }

    form = renderForm(store.state, result, config);
    pagesContainer.innerHTML = form.svg.join('\n');

    if (result.error) {
      warning.hidden = false;
      warning.textContent = `Classification could not be calculated: ${result.error}`;
    } else {
      warning.hidden = true;
    }

    dialog.showModal();
  });

  document.getElementById('preview-close').addEventListener('click', () => dialog.close());

  document.getElementById('export-pdf').addEventListener('click', () => {
    exportPdf(form, store.state, config);
    toast('PDF downloaded.', 'ok');
  });

  document.getElementById('export-png').addEventListener('click', async () => {
    try {
      await exportPng(form, store.state);
      toast('PNG downloaded.', 'ok');
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  document.getElementById('export-svg').addEventListener('click', () => {
    exportSvg(form, store.state);
    toast('SVG downloaded.', 'ok');
  });

  document.getElementById('export-print').addEventListener('click', () => window.print());

  const uploadButton = document.getElementById('export-upload');
  if (config.upload?.url) {
    uploadButton.hidden = false;
    uploadButton.textContent = config.upload.buttonLabel || 'Send to record';
    uploadButton.addEventListener('click', async () => {
      uploadButton.disabled = true;
      try {
        await uploadForm(form, store.state, config);
        toast('Sent to the record system.', 'ok');
      } catch (error) {
        toast(error.message, 'error');
      } finally {
        uploadButton.disabled = false;
      }
    });
  }
}

/* -------------------------------------------------------------- autosave */

/**
 * Drafts live in sessionStorage, never localStorage: a half-finished exam
 * survives an accidental reload but does not outlive the browser session on a
 * shared ward workstation. Sites that forbid even that set `autosave: false`.
 */
function saveDraft(state, config) {
  if (!config.autosave) {
    return;
  }
  try {
    sessionStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state));
  } catch (error) {
    // Storage full or blocked by policy — the app still works, just without
    // reload protection, so this is deliberately silent.
  }
}

function restoreDraft(config) {
  if (!config.autosave) {
    return createEmptyState();
  }
  try {
    const raw = sessionStorage.getItem(AUTOSAVE_KEY);
    return raw ? fromJSON(JSON.parse(raw)) : createEmptyState();
  } catch (error) {
    return createEmptyState();
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(AUTOSAVE_KEY);
  } catch (error) {
    // Nothing to do; a failed clear cannot break the new exam.
  }
}

/* ----------------------------------------------------------------- toasts */

export function toast(message, tone = 'info', timeout = 4000) {
  const stack = document.getElementById('toasts');
  const element = document.createElement('div');
  element.className = 'toast';
  element.dataset.tone = tone;
  element.textContent = message;
  stack.appendChild(element);
  setTimeout(() => element.remove(), timeout);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  toast(`The worksheet failed to start: ${error.message}`, 'error', 15000);
});
