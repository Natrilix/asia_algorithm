/**
 * The patient search UI.
 *
 * Deliberately thin: it debounces typing, renders results and surfaces errors.
 * Everything provider-specific — DAX, tokens, endpoints — lives behind
 * `createLookupProvider` so this file never changes when the data source does.
 */

import { createLookupProvider } from './lookup/index.js';
import { normaliseQuery } from './lookup/record.js';
import { SignInRequiredError } from './auth/pkce.js';
import { formatDate } from './format.js';

const DEBOUNCE_MS = 300;

export class LookupPanel {
  constructor({ config, root, onSelect, onError }) {
    this.config = config;
    this.root = root;
    this.onSelect = onSelect;
    this.onError = onError;
    this.provider = createLookupProvider(config);

    this.input = root.querySelector('#lookup-query');
    this.button = root.querySelector('#lookup-search');
    this.status = root.querySelector('#lookup-status');
    this.list = root.querySelector('#lookup-results');
    this.timer = null;
    this.controller = null;
  }

  async init() {
    if (!this.provider.enabled) {
      this.root.hidden = true;
      return;
    }

    // A provider using a redirect sign-in has to be given the chance to finish
    // the round trip before anything else touches the page.
    if (this.provider.handleRedirect) {
      try {
        const signedIn = await this.provider.handleRedirect();
        if (signedIn) {
          this.setStatus('Signed in.');
        }
      } catch (error) {
        this.setStatus(error.message, 'error');
      }
    }

    this.input.placeholder = `${this.config.mrnLabel || 'MRN'} or family name`;
    if (this.provider.label) {
      this.root.querySelector('.lookup__label').textContent =
        `Find an admitted patient — ${this.provider.label}`;
    }

    this.input.addEventListener('input', () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.search(), DEBOUNCE_MS);
    });
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        clearTimeout(this.timer);
        this.search();
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.list.querySelector('button')?.focus();
      }
    });
    this.button.addEventListener('click', () => {
      clearTimeout(this.timer);
      this.search();
    });
  }

  async search() {
    const query = normaliseQuery(this.input.value, this.config);
    if (!query) {
      this.renderResults([]);
      this.setStatus('');
      return;
    }

    this.controller?.abort();
    this.controller = new AbortController();
    this.setStatus('Searching…');

    try {
      const results = await this.provider.search(query, { signal: this.controller.signal });
      this.renderResults(results);
      this.setStatus(results.length
        ? `${results.length} ${results.length === 1 ? 'match' : 'matches'}.`
        : 'No matching admitted patient.');
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      this.renderResults([]);
      if (error instanceof SignInRequiredError || error.name === 'SignInRequiredError') {
        this.promptSignIn();
        return;
      }
      this.setStatus(error.message, 'error');
      this.onError?.(error.message);
    }
  }

  promptSignIn() {
    this.setStatus('');
    this.list.hidden = false;
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lookup__result';
    button.innerHTML = '<strong>Sign in to search</strong><span>You will be returned to this page.</span>';
    button.addEventListener('click', () => this.provider.signIn());
    item.appendChild(button);
    this.list.replaceChildren(item);
  }

  renderResults(results) {
    if (!results.length) {
      this.list.replaceChildren();
      this.list.hidden = true;
      return;
    }

    const mrnLabel = this.config.mrnLabel || 'MRN';
    this.list.replaceChildren(...results.map((record) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lookup__result';

      const name = document.createElement('strong');
      name.textContent = [record.familyName.toUpperCase(), record.givenName]
        .filter(Boolean).join(', ');

      const detail = document.createElement('span');
      detail.textContent = [
        record.mrn ? `${mrnLabel} ${record.mrn}` : '',
        record.dateOfBirth ? `DOB ${formatDate(record.dateOfBirth)}` : '',
        record.ward,
      ].filter(Boolean).join(' · ');

      button.append(name, detail);
      button.addEventListener('click', () => {
        this.onSelect(record);
        this.renderResults([]);
        this.setStatus(`Selected ${record.mrn ? `${mrnLabel} ${record.mrn}` : 'patient'}.`);
        this.input.value = '';
      });
      item.appendChild(button);
      return item;
    }));
    this.list.hidden = false;
  }

  setStatus(message, tone = '') {
    this.status.textContent = message;
    if (tone) {
      this.status.dataset.tone = tone;
    } else {
      delete this.status.dataset.tone;
    }
  }
}
