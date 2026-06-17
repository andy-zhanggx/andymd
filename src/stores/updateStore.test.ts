import { describe, it, expect, beforeEach } from 'vitest';
import { useUpdateStore } from './updateStore';

describe('updateStore', () => {
  beforeEach(() => {
    useUpdateStore.setState({ status: 'idle', availableVersion: null, lastCheckedAt: null });
  });

  it('transitions through the check/download/ready lifecycle', () => {
    const s = () => useUpdateStore.getState();
    s().setChecking();
    expect(s().status).toBe('checking');
    s().setDownloading('0.2.0');
    expect(s().status).toBe('downloading');
    expect(s().availableVersion).toBe('0.2.0');
    s().setReady();
    expect(s().status).toBe('ready');
  });

  it('records lastCheckedAt when going idle', () => {
    useUpdateStore.getState().setIdle(12345);
    expect(useUpdateStore.getState().status).toBe('idle');
    expect(useUpdateStore.getState().lastCheckedAt).toBe(12345);
  });

  it('sets error status', () => {
    useUpdateStore.getState().setError();
    expect(useUpdateStore.getState().status).toBe('error');
  });
});
