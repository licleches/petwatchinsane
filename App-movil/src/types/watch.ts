// Adaptado de MedTime (src/types/watch.ts). Contrato en docs/smartwatch/contrato-api.md.

export type WatchConnectionState = 'no_device' | 'pending' | 'linked' | 'error' | 'not_configured';

export type WatchDevice = {
  id: string;
  name: string | null;
  type: string | null;
  identifier: string | null;
  status: 'pending' | 'linked';
  linkedAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string | null;
};

export type WatchPairingPreview = {
  requestId: string;
  deviceName: string;
  deviceType: string;
  status: 'pending' | 'approved' | 'claimed';
  expiresAt: string;
  canApprove: boolean;
};

export type WatchPairingApproval = {
  requestId: string;
  deviceId: string;
  status: 'pending' | 'linked';
  linkedAt: string | null;
  expiresAt: string;
};

export type WatchConnection = {
  state: WatchConnectionState;
  devices: WatchDevice[];
  message: string;
};
