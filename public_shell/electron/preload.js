const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onQrPayload: (callback) => ipcRenderer.on('qr-payload', (_event, value) => callback(value)),
    onHandshakeComplete: (callback) => ipcRenderer.on('handshake-complete', (_event, value) => callback(value)),
    onSyncUpdate: (callback) => ipcRenderer.on('sync-update', (_event, value) => callback(value)),
    processCSV: (filePath) => ipcRenderer.send('process-csv', filePath),
    onCSVLoaded: (callback) => ipcRenderer.on('csv-loaded', (_event, value) => callback(value)),
    uiReady: () => ipcRenderer.send('ui-ready'),
    getIdentity: () => ipcRenderer.invoke('get-identity'),
    saveIdentity: (packet) => ipcRenderer.invoke('save-identity', packet),
    generateReports: (payload) => ipcRenderer.invoke('generate-reports', payload),
    resetAppData: () => ipcRenderer.invoke('reset-app-data'),
    getTeachers: () => ipcRenderer.invoke('get-teachers'),
    setTeacher: (data) => ipcRenderer.invoke('set-teacher', data),
    getDbStats: () => ipcRenderer.invoke('get-db-stats'),
    addTeacherForm: (data) => ipcRenderer.invoke('add-teacher-form', data),
    updateTeacher: (data) => ipcRenderer.invoke('update-teacher', data),
    addStudentForm: (data) => ipcRenderer.invoke('add-student-form', data),
    onLicenseStatus: (callback) => ipcRenderer.on('license-status', (_event, value) => callback(value)),
    getAllTeachers: () => ipcRenderer.invoke('get-all-teachers'),
    getAllStudents: () => ipcRenderer.invoke('get-all-students'),
    deleteTeacher: (data) => ipcRenderer.invoke('delete-teacher', data),
    deleteStudent: (data) => ipcRenderer.invoke('delete-student', data),
    // Window chrome controls
    winMinimize: () => ipcRenderer.send('win-minimize'),
    winMaximize: () => ipcRenderer.send('win-maximize'),
    winClose:    () => ipcRenderer.send('win-close'),
    getPlatform: () => ipcRenderer.invoke('get-platform'),
    // V2: Term config & Print Hub
    getTermConfig:      ()       => ipcRenderer.invoke('get-term-config'),
    saveTermConfig:     (data)   => ipcRenderer.invoke('save-term-config', data),
    queryResults:       (filter) => ipcRenderer.invoke('query-results', filter),
    saveDomainScores:   (data)   => ipcRenderer.invoke('save-domain-scores', data),
    saveTeacherRemark:  (data)   => ipcRenderer.invoke('save-teacher-remark', data),
    // V2.1: Edit existing resources
    updateStudent:      (data)   => ipcRenderer.invoke('update-student', data),
    updateTeacherFull:  (data)   => ipcRenderer.invoke('update-teacher-full', data),
    // V3: Result Studio
    copyResultImage:    (data)   => ipcRenderer.invoke('copy-result-image', data),
    // Phase 2: Form Teachers & Remarks
    getFormTeachers:    ()       => ipcRenderer.invoke('get-form-teachers'),
    setFormTeacher:     (data)   => ipcRenderer.invoke('set-form-teacher', data),
    saveBulkRemarks:    (data)   => ipcRenderer.invoke('save-bulk-remarks', data),
    // V4 (Phase 0): Limit Engine
    revokeDevice:       (id)     => ipcRenderer.invoke('revoke-device', id),
    onShowUpgradeModal: (callback) => ipcRenderer.on('show-upgrade-modal', (_event, value) => callback(value)),
    // Phase 3.1: The Wow Factor (UDP Heartbeats)
    onPulseHeartbeat:   (callback) => ipcRenderer.on('pulse-heartbeat', (_event, value) => callback(value)),
    // V2.2: Dynamic Stamps & Metadata
    getStampPreview:    (data)   => ipcRenderer.invoke('get-stamp-preview', data),
    getUniqueMetadata:  ()       => ipcRenderer.invoke('get-unique-metadata'),
    getHardwareId:      ()       => ipcRenderer.invoke('get-hardware-id'),
});


