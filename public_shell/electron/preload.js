const { contextBridge, ipcRenderer } = require('electron');

// Shared API object — exposed as both 'electronAPI' (legacy) and 'nexusAPI' (lock screen + new code)
const nexusAPI = {
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
    getAllTeachers: (params) => ipcRenderer.invoke('get-all-teachers', params),
    getAllStudents: (params) => ipcRenderer.invoke('get-all-students', params),
    getClasses:     ()       => ipcRenderer.invoke('get-classes'),
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
    
    // Gold Phase A: Attendance
    getDailyAttendance: (data)   => ipcRenderer.invoke('get-daily-attendance', data),
    saveDailyAttendance:(data)   => ipcRenderer.invoke('save-daily-attendance', data),
    getStudentAttendanceReport: (data) => ipcRenderer.invoke('get-student-attendance-report', data),

    // Gold Phase B: Nexus Pulse (WhatsApp Bot)
    onPulseStatus:      (callback) => ipcRenderer.on('pulse-status', (_event, value) => callback(value)),
    pulse: {
        start: () => ipcRenderer.send('pulse:start'),
        stop: () => ipcRenderer.send('pulse:stop'),
        status: () => ipcRenderer.invoke('pulse:status'),
        // Cloud Bridge (Turn 2)
        saveGoogleCreds: (creds) => ipcRenderer.send('pulse:save-google-creds', creds),
        getGoogleAuthUrl: () => ipcRenderer.invoke('pulse:get-google-auth-url'),
        getCloudStatus: () => ipcRenderer.invoke('pulse:get-cloud-status'),
        triggerSync: () => ipcRenderer.send('pulse:trigger-sync'),
        onCloudSynced: (callback) => ipcRenderer.on('pulse:cloud-synced', (_event, value) => callback(value)),
        onSyncError: (callback) => ipcRenderer.on('pulse:sync-error', (_event, value) => callback(value))
    },
    // Phase 5: Fee Management
    fees: {
        getRoster:       (params) => ipcRenderer.invoke('fees:get-roster',        params),
        upsert:          (params) => ipcRenderer.invoke('fees:upsert',            params),
        recordPayment:   (params) => ipcRenderer.invoke('fees:record-payment',    params),
        getTransactions: (params) => ipcRenderer.invoke('fees:get-transactions',  params),
        getSettings:     ()       => ipcRenderer.invoke('fees:get-settings'),
        saveSettings:    (patch)  => ipcRenderer.invoke('fees:save-settings',     patch),
    },
    // Phase 3.2: Sovereign Portal (Nexus Mask Architecture)
    portal: {
        getInfo: () => ipcRenderer.invoke('portal:get-info'),
    },
    // ── Admin Authentication (The Vault) ──────────────────────────────────
    auth: {
        getAdmins:  ()       => ipcRenderer.invoke('auth:get-admins'),
        verifyPin:  (data)   => ipcRenderer.invoke('auth:verify-pin', data),
        unlock:     ()       => ipcRenderer.send('auth:unlock'),
        getSession: ()       => ipcRenderer.invoke('auth:get-session'),
    },
    // ── Fee Structure Management ───────────────────────────────────────
    feeStructure: {
        getAll:      (params) => ipcRenderer.invoke('fee-structure:get-all',       params),
        upsertItem:  (data)   => ipcRenderer.invoke('fee-structure:upsert-item',   data),
        deleteItem:  (id)     => ipcRenderer.invoke('fee-structure:delete-item',   id),
        applyToClass:(data)   => ipcRenderer.invoke('fee-structure:apply-to-class',data),
        getAdjustments: (params) => ipcRenderer.invoke('fee-structure:get-adjustments', params),
        addAdjustment:  (data)   => ipcRenderer.invoke('fee-structure:add-adjustment',  data),
        deleteAdjustment:(id)    => ipcRenderer.invoke('fee-structure:delete-adjustment',id),
    },
    // ── Message Queue (WhatsApp bulk send) ───────────────────────────
    queue: {
        getStatus:   ()       => ipcRenderer.invoke('queue:get-status'),
        onProgress:  (cb)     => ipcRenderer.on('queue:progress', (_e, v) => cb(v)),
    },
    // ── Generic bridge (Guardian Shield, etc.) ───────────────────────
    invoke: (channel, data)  => ipcRenderer.invoke(channel, data),
    send:   (channel, data)  => ipcRenderer.send(channel, data),
    on:     (channel, cb)    => ipcRenderer.on(channel, (_event, value) => cb(value)),
    openExternal: (url)      => ipcRenderer.send('shell:openExternal', url),
};

// Expose under both names — legacy code uses electronAPI, new code (lock.html etc.) uses nexusAPI
contextBridge.exposeInMainWorld('electronAPI', nexusAPI);
contextBridge.exposeInMainWorld('nexusAPI', nexusAPI);
