import sys

with open("/Users/MAC/Documents/Projects/nexus-school/public_shell/electron/index.html", "r") as f:
    lines = f.readlines()

new_lines = []
in_script_block = False

for i, line in enumerate(lines):
    if "<script>" in line and '"use strict";' in lines[i+1]:
        in_script_block = True
        new_lines.append(line)
        new_lines.append('      "use strict";\n')
        # Insert all modular imports! Oh wait, the imports should REPLACE the <script> block, not be inside it!
        # Actually I just want to replace the whole <script>...</script> block with <script src=...></script> tags.
        continue
        
    if in_script_block:
        if "</script>" in line:
            in_script_block = False
            # Insert the new scripts!
            new_lines.append('    <script src="js/state.js"></script>\n')
            new_lines.append('    <script src="js/nav.js"></script>\n')
            new_lines.append('    <script src="js/dashboard.js"></script>\n')
            new_lines.append('    <script src="js/teachers.js"></script>\n')
            new_lines.append('    <script src="js/students.js"></script>\n')
            new_lines.append('    <script src="js/printhub.js"></script>\n')
            new_lines.append('    <script src="js/result-studio.js"></script>\n')
            new_lines.append('    <script src="js/settings.js"></script>\n')
            new_lines.append('    <script src="js/sync.js"></script>\n')
            new_lines.append('    <script src="js/boot.js"></script>\n')
        continue
        
    new_lines.append(line)

with open("/Users/MAC/Documents/Projects/nexus-school/public_shell/electron/index.html", "w") as f:
    f.writelines(new_lines)
