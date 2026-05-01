const fs = require('fs');

const path = '/Users/MAC/Documents/Projects/nexus-school/public_shell/electron/pulse-exporter.js';
let content = fs.readFileSync(path, 'utf8');

const folderLogic = `
    /**
     * Ensures the Nexus folder architecture exists in Google Drive
     * Returns a map of folder names to their Drive IDs
     */
    async ensureFolderArchitecture(drive) {
        // Helper to find or create a folder
        const getOrCreateFolder = async (name, parentId = null) => {
            const query = \`name = '\${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false\` + 
                          (parentId ? \` and '\${parentId}' in parents\` : \` and 'root' in parents\`);
            
            const response = await drive.files.list({ q: query, fields: 'files(id)' });
            
            if (response.data.files.length > 0) {
                return response.data.files[0].id;
            } else {
                const resource = {
                    name: name,
                    mimeType: 'application/vnd.google-apps.folder'
                };
                if (parentId) resource.parents = [parentId];
                
                const created = await drive.files.create({
                    resource,
                    fields: 'id'
                });
                return created.data.id;
            }
        };

        const db = database.getDb();
        const schoolNameRow = db.prepare("SELECT value FROM app_settings WHERE key = 'school_name'").get();
        const schoolName = schoolNameRow?.value || "Nexus School";

        const rootId = await getOrCreateFolder('Nexus School OS');
        const schoolId = await getOrCreateFolder(schoolName, rootId);
        
        const folders = {
            root: rootId,
            school: schoolId,
            backups: await getOrCreateFolder('Backups', schoolId),
            cache: await getOrCreateFolder('Cache', schoolId),
            knowledge: await getOrCreateFolder('Knowledge Base', schoolId),
            exports: await getOrCreateFolder('Exports', schoolId),
            inbox: await getOrCreateFolder('Pulse Inbox Archive', schoolId)
        };
        
        return folders;
    }
`;

// Insert the folder logic right after the generateCache method
content = content.replace(
    '    async syncToDrive() {',
    folderLogic + '\n    /**\n     * Exports the encrypted cache and full database backup to Google Drive\n     */\n    async syncToDrive() {'
);

// Update syncToDrive to use the folders
content = content.replace(
    '            const drive = google.drive({ version: \'v3\', auth: this.oAuth2Client });',
    '            const drive = google.drive({ version: \'v3\', auth: this.oAuth2Client });\n\n            // Ensure Diamond folder architecture\n            const folders = await this.ensureFolderArchitecture(drive);'
);

content = content.replace(
    "                q: \"name = 'pulse_cache.enc' and trashed = false\",",
    "                q: `name = 'pulse_cache.enc' and '${folders.cache}' in parents and trashed = false`,"
);

content = content.replace(
    "                    resource: { name: 'pulse_cache.enc', mimeType: 'text/plain' },",
    "                    resource: { name: 'pulse_cache.enc', mimeType: 'text/plain', parents: [folders.cache] },"
);

// Update backupDatabaseToDrive to use the folders
content = content.replace(
    '    async backupDatabaseToDrive(drive, key) {',
    '    async backupDatabaseToDrive(drive, key, folders) {'
);

content = content.replace(
    '            // 2. Perform Full Database Backup (Sovereign Shield Requirement)\n            await this.backupDatabaseToDrive(drive, key);',
    '            // 2. Perform Full Database Backup (Sovereign Shield Requirement)\n            await this.backupDatabaseToDrive(drive, key, folders);'
);

content = content.replace(
    "                q: `name = '${fileName}' and trashed = false`,",
    "                q: `name = '${fileName}' and '${folders.backups}' in parents and trashed = false`,"
);

content = content.replace(
    "                    resource: { name: fileName, mimeType: 'text/plain' },",
    "                    resource: { name: fileName, mimeType: 'text/plain', parents: [folders.backups] },"
);

fs.writeFileSync(path, content, 'utf8');
console.log('Success');
