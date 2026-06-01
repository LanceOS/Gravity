import os
import re

mapping = {
    "--spacing-xs": "--space-xs",
    "--spacing-sm": "--space-sm",
    "--spacing-md": "--space-md",
    "--spacing-lg": "--space-lg",
    "--spacing-xl": "--space-xl",
    
    "--space-1": "--space-xs",
    "--space-2": "--space-sm",
    "--space-3": "--space-md",
    "--space-4": "--space-md",
    "--space-5": "--space-lg",
    "--space-6": "--space-lg",
    "--space-8": "--space-xl",
}

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    new_content = content
    for old, new in mapping.items():
        new_content = new_content.replace(old, new)
        
    if content != new_content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

for root, dirs, files in os.walk('client/src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts') or file.endswith('.css'):
            process_file(os.path.join(root, file))

