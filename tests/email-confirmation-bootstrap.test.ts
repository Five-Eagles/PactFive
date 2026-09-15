import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  captureInitialEmailConfirmation,
  createEmailConfirmationBootstrap,
  EMAIL_CONFIRMATION_PATH,
  getInitialEmailConfirmationTokenHash,
} from '../app/web/src/features/user-management/auth.bootstrap';

test('captures the fragment and removes all credential URL forms before exposing it', () => {
  const bootstrap = createEmailConfirmationBootstrap();
  const urls: string[] = [];
  bootstrap.capture({
    pathname: EMAIL_CONFIRMATION_PATH,
    search: '?returnTo=%2Fprojects%2Fnew&token=legacy&tokenHash=query-one&token_hash=query-two&token=query-three',
    hash: '#tokenHash=fragment-test-value&type=signup',
    replaceUrl: (url) => {
      assert.equal(bootstrap.readTokenHash(), null);
      urls.push(url);
    },
  });
  assert.equal(bootstrap.readTokenHash(), 'fragment-test-value');
  assert.deepEqual(urls, ['/auth/confirm?returnTo=%2Fprojects%2Fnew']);
});

test('query-only links cannot authenticate and have their credentials removed', () => {
  for (const key of ['token', 'tokenHash', 'token_hash']) {
    const bootstrap = createEmailConfirmationBootstrap();
    const urls: string[] = [];
    bootstrap.capture({
      pathname: EMAIL_CONFIRMATION_PATH,
      search: `?${key}=query-test-value&returnTo=%2Fprojects`,
      hash: '',
      replaceUrl: (url) => urls.push(url),
    });
    assert.equal(bootstrap.readTokenHash(), null);
    assert.deepEqual(urls, ['/auth/confirm?returnTo=%2Fprojects']);
  }
});

test('empty and invalid fragments stay missing and are cleaned without falling back to query', () => {
  for (const hash of ['', '#tokenHash=', '#tokenHash=short', '#tokenHash=%20%20%20%20%20%20%20%20', '#type=email']) {
    const bootstrap = createEmailConfirmationBootstrap();
    const urls: string[] = [];
    bootstrap.capture({
      pathname: EMAIL_CONFIRMATION_PATH,
      search: '?tokenHash=query-must-not-be-used',
      hash,
      replaceUrl: (url) => urls.push(url),
    });
    assert.equal(bootstrap.readTokenHash(), null);
    assert.deepEqual(urls, ['/auth/confirm']);
  }
});

test('router reads and StrictMode initialization reuse the value after URL cleanup', () => {
  const bootstrap = createEmailConfirmationBootstrap();
  const urls: string[] = [];
  bootstrap.capture({
    pathname: EMAIL_CONFIRMATION_PATH,
    search: '',
    hash: '#tokenHash=first-test-value',
    replaceUrl: (url) => urls.push(url),
  });
  assert.equal(bootstrap.readTokenHash(), 'first-test-value');
  bootstrap.capture({
    pathname: EMAIL_CONFIRMATION_PATH,
    search: '',
    hash: '',
    replaceUrl: (url) => urls.push(url),
  });
  assert.equal(bootstrap.readTokenHash(), 'first-test-value');
  assert.equal(bootstrap.readTokenHash(), 'first-test-value');
  assert.deepEqual(urls, ['/auth/confirm']);
});

test('a full reload of the cleaned URL cannot recover the previous page memory', () => {
  const reloaded = createEmailConfirmationBootstrap();
  reloaded.capture({
    pathname: EMAIL_CONFIRMATION_PATH,
    search: '?returnTo=%2Fprojects',
    hash: '',
    replaceUrl: () => assert.fail('clean URL should not be rewritten'),
  });
  assert.equal(reloaded.readTokenHash(), null);
});

test('other routes keep their fragment and do not consume the confirmation capture', () => {
  const bootstrap = createEmailConfirmationBootstrap();
  bootstrap.capture({
    pathname: '/projects',
    search: '?token=unrelated',
    hash: '#details',
    replaceUrl: () => assert.fail('another route was changed'),
  });
  assert.equal(bootstrap.readTokenHash(), null);
  bootstrap.capture({
    pathname: EMAIL_CONFIRMATION_PATH,
    search: '',
    hash: '#tokenHash=confirmation-test-value',
    replaceUrl: () => undefined,
  });
  assert.equal(bootstrap.readTokenHash(), 'confirmation-test-value');
});

test('failed URL cleanup does not expose the confirmation credential', () => {
  const bootstrap = createEmailConfirmationBootstrap();
  assert.throws(() => bootstrap.capture({
    pathname: EMAIL_CONFIRMATION_PATH,
    search: '',
    hash: '#tokenHash=confirmation-test-value',
    replaceUrl: () => { throw new Error('history unavailable'); },
  }), /history unavailable/);
  assert.equal(bootstrap.readTokenHash(), null);
});

test('importing and initializing without a browser is safe and yields no credential', () => {
  assert.equal(typeof window, 'undefined');
  assert.doesNotThrow(captureInitialEmailConfirmation);
  assert.equal(getInitialEmailConfirmationTokenHash(), null);
});
