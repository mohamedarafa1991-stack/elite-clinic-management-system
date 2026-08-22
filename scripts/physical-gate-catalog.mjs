export const PHYSICAL_GATES = [
  {
    id: "WIN-INSTALL-001",
    status: "pending",
    detail: "Requires packaged Windows 10/11 clean-install evidence.",
  },
  {
    id: "WIN-INSTALL-002",
    status: "pending",
    detail: "Requires packaged Windows upgrade and migration evidence.",
  },
  {
    id: "WIN-INSTALL-003",
    status: "pending",
    detail:
      "Requires uninstall/reinstall evidence preserving encrypted data, audit history, and native-module compatibility.",
  },
  {
    id: "WIN-DB-001",
    status: "pending",
    detail: "Requires production OS-backed key-provider behavior on Windows.",
  },
  {
    id: "WIN-SEC-001",
    status: "pending",
    detail:
      "Requires Windows security-boundary evidence for least-privilege operation, redacted logs, and protected local storage.",
  },
  {
    id: "WIN-LAN-001",
    status: "pending",
    detail:
      "Requires Windows Hub LAN discovery, firewall, TLS endpoint, and enrolled-device connectivity evidence.",
  },
  {
    id: "WIN-BACKUP-001",
    status: "pending",
    detail:
      "Requires Admin-controlled encrypted removable-media backup evidence.",
  },
  {
    id: "WIN-RESTORE-001",
    status: "pending",
    detail:
      "Requires replacement-Hub restore with the approved production key.",
  },
  {
    id: "WIN-RECOVERY-001",
    status: "pending",
    detail: "Requires interrupted-upgrade rollback evidence on Windows.",
  },
  {
    id: "AND-BOOT-001",
    status: "pending",
    detail:
      "Requires Android floor/current device installation and enrollment evidence.",
  },
  {
    id: "AND-BOOT-002",
    status: "pending",
    detail:
      "Requires offline start, inactivity-lock, and no-cloud-dependency evidence.",
  },
  {
    id: "AND-BOOT-003",
    status: "pending",
    detail:
      "Requires configured thirty-day offline-access expiry and documented recovery evidence.",
  },
  {
    id: "AND-KEY-001",
    status: "pending",
    detail:
      "Requires invalid or unavailable Keystore identity-key failure-closed and recovery evidence.",
  },
  {
    id: "AND-DB-001",
    status: "pending",
    detail:
      "Requires SQLCipher Room startup and migration evidence on hardware.",
  },
  {
    id: "AND-SYNC-001",
    status: "pending",
    detail:
      "Requires seven-scope LAN synchronization, including billing-summary and doctor-summary, with a Windows Hub and device.",
  },
  {
    id: "AND-SYNC-002",
    status: "pending",
    detail: "Requires two-device durable-claim and fairness evidence.",
  },
  {
    id: "AND-SYNC-003",
    status: "pending",
    detail:
      "Requires Android TLS failure, retry-now, and Hub restart evidence.",
  },
  {
    id: "AND-SYNC-004",
    status: "pending",
    detail: "Requires process-death recovery evidence on Android hardware.",
  },
  {
    id: "AND-BILL-001",
    status: "pending",
    detail:
      "Requires Android billing-summary projection and malformed-payload evidence.",
  },
  {
    id: "AND-DOC-001",
    status: "pending",
    detail:
      "Requires LAN document upload/view and Android persistence inventory.",
  },
  {
    id: "AND-DOC-002",
    status: "pending",
    detail:
      "Requires FLAG_SECURE, recents, recording, and viewer cleanup observation.",
  },
  {
    id: "AND-DOC-003",
    status: "pending",
    detail: "Requires picker MIME/size/camera-optional behavior on devices.",
  },
  {
    id: "AND-RELEASE-001",
    status: "pending",
    detail:
      "Requires signed APK install, upgrade, rollback, and revocation evidence.",
  },
];

export const PHYSICAL_GATE_IDS = PHYSICAL_GATES.map((gate) => gate.id);
