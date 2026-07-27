/**
 * Patient identification: the field bindings, the validation that enforces the
 * institution's points of identification, and the lookup result binding.
 *
 * Which fields are mandatory comes from `config.requiredPatientFields` so that
 * local policy — not this file — decides what counts as adequate identification.
 */

import { formatPatientName, todayIso, nowTimeIso } from './format.js';

/** Field descriptors keyed by the identifier names used in configuration. */
const REQUIREMENTS = {
  name: {
    label: 'Patient name',
    inputs: ['patient-familyName', 'patient-givenName'],
    satisfied: (state) => Boolean(state.patient.familyName.trim() && state.patient.givenName.trim()),
  },
  familyName: {
    label: 'Family name',
    inputs: ['patient-familyName'],
    satisfied: (state) => Boolean(state.patient.familyName.trim()),
  },
  mrn: {
    label: 'Medical record number',
    inputs: ['patient-mrn'],
    satisfied: (state) => Boolean(state.patient.mrn.trim()),
  },
  dateOfBirth: {
    label: 'Date of birth',
    inputs: ['patient-dateOfBirth'],
    satisfied: (state) => Boolean(state.patient.dateOfBirth.trim()),
  },
  sex: {
    label: 'Sex',
    inputs: ['patient-sex'],
    satisfied: (state) => Boolean(state.patient.sex.trim()),
  },
  encounter: {
    label: 'Encounter / admission',
    inputs: ['patient-encounter'],
    satisfied: (state) => Boolean(state.patient.encounter.trim()),
  },
  examDate: {
    label: 'Date of examination',
    inputs: ['exam-examDate'],
    satisfied: (state) => Boolean(state.exam.examDate.trim()),
  },
  examiner: {
    label: 'Examiner',
    inputs: ['exam-examiner'],
    satisfied: (state) => Boolean(state.exam.examiner.trim()),
  },
};

export class PatientPanel {
  constructor({ store, root, config }) {
    this.store = store;
    this.root = root;
    this.config = config;
    this.bindInputs();
    this.applyLabels();
  }

  bindInputs() {
    // Queried document-wide, not from `root`: the comments textarea lives with
    // the worksheet rather than in the identification panel.
    this.inputs = [...document.querySelectorAll('[data-patient], [data-exam]')];
    for (const input of this.inputs) {
      input.addEventListener('input', () => {
        const section = input.dataset.patient ? 'patient' : 'exam';
        const key = input.dataset.patient ?? input.dataset.exam;
        this.store.update((state) => {
          state[section][key] = input.value;
        }, { source: 'patient-input' });
      });
    }
  }

  applyLabels() {
    const mrnLabel = document.getElementById('patient-mrn-label');
    if (mrnLabel && this.config.mrnLabel) {
      mrnLabel.textContent = this.config.mrnLabel;
    }
    for (const [name, requirement] of Object.entries(REQUIREMENTS)) {
      const required = this.requiredFields().includes(name);
      for (const id of requirement.inputs) {
        const field = document.getElementById(id)?.closest('.field');
        if (field) {
          field.classList.toggle('field--required', required || field.dataset.alwaysRequired === 'true');
        }
      }
    }
  }

  requiredFields() {
    const configured = this.config.requiredPatientFields;
    return Array.isArray(configured) && configured.length
      ? configured.filter((name) => name in REQUIREMENTS)
      : ['name', 'mrn', 'dateOfBirth'];
  }

  /** Fills empty date/time fields so the exported form always carries them. */
  prefillExamDateTime() {
    this.store.update((state) => {
      if (!state.exam.examDate) {
        state.exam.examDate = todayIso();
      }
      if (!state.exam.examTime) {
        state.exam.examTime = nowTimeIso();
      }
    });
  }

  /** Copies a lookup result into the state, leaving exam fields untouched. */
  applyLookupResult(record) {
    this.store.update((state) => {
      state.patient.familyName = record.familyName ?? '';
      state.patient.givenName = record.givenName ?? '';
      state.patient.mrn = record.mrn ?? '';
      state.patient.dateOfBirth = record.dateOfBirth ?? '';
      state.patient.sex = record.sex ?? '';
      state.patient.ward = record.ward ?? '';
      state.patient.encounter = record.encounter ?? '';
      state.patient.source = record.source ?? '';
    }, { source: 'lookup' });
  }

  /** @returns {{ok: boolean, missing: string[]}} */
  validate() {
    const state = this.store.state;
    const missing = this.requiredFields()
      .filter((name) => !REQUIREMENTS[name].satisfied(state))
      .map((name) => REQUIREMENTS[name].label);
    return { ok: missing.length === 0, missing };
  }

  /** Paints the invalid state after a failed export attempt. */
  showValidation() {
    const state = this.store.state;
    for (const name of this.requiredFields()) {
      const requirement = REQUIREMENTS[name];
      const ok = requirement.satisfied(state);
      for (const id of requirement.inputs) {
        document.getElementById(id)?.closest('.field')?.classList.toggle('field--invalid', !ok);
      }
    }
  }

  clearValidation() {
    for (const field of this.root.querySelectorAll('.field--invalid')) {
      field.classList.remove('field--invalid');
    }
  }

  refresh() {
    const state = this.store.state;
    for (const input of this.inputs) {
      const section = input.dataset.patient ? 'patient' : 'exam';
      const key = input.dataset.patient ?? input.dataset.exam;
      const value = state[section][key] ?? '';
      if (input.value !== value && document.activeElement !== input) {
        input.value = value;
      }
    }
  }

  /** Short identification string used in toasts and filenames. */
  summary() {
    const patient = this.store.state.patient;
    const name = formatPatientName(patient);
    return [name, patient.mrn].filter(Boolean).join(' · ');
  }
}
