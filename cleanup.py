"""
Clean up temporary Python scripts and markdown files
that are no longer needed
"""

import os

def remove_files():
    """Remove temporary and redundant files"""
    
    # Python scripts to remove (already used for setup)
    python_files_to_remove = [
        "setup.py",
        "setup.bat", 
        "setup.ps1",
        "setup-supabase-files.py",
        "create-dirs.py",
        "reorganize.py",
        "organize-structure.py",
    ]
    
    # Markdown files to remove (temporary/redundant)
    markdown_files_to_remove = [
        "SETUP.md",
        "CURRENT_STATUS.md",
        "PHASE1_COMPLETE.md",
        "SUPABASE_QUICKSTART.md",
        "NEXT_STEPS.md",
        "REORGANIZATION_PLAN.md",
        "REORGANIZATION_COMPLETE.md",
        "REORGANIZE_STEPS.md",
        "IMPORT_FIXES.md",
        "IMPORT_UPDATES.md",
        "PHASE1_GUIDE.md",
    ]
    
    all_files_to_remove = python_files_to_remove + markdown_files_to_remove
    
    print("=" * 60)
    print("Cleaning Up Temporary Files")
    print("=" * 60)
    print()
    
    removed_count = 0
    not_found_count = 0
    
    for file in all_files_to_remove:
        if os.path.exists(file):
            os.remove(file)
            print(f"✓ Removed: {file}")
            removed_count += 1
        else:
            print(f"⚠ Not found: {file}")
            not_found_count += 1
    
    print()
    print("=" * 60)
    print("Cleanup Complete!")
    print("=" * 60)
    print(f"\nRemoved: {removed_count} files")
    print(f"Not found: {not_found_count} files")
    
    print("\n📋 Files Kept (Important):")
    important_files = [
        "README.md - Main documentation",
        "QUICKSTART.md - Quick start guide",
        "GITHUB_SETUP.md - Team setup instructions",
        "PROJECT_STRUCTURE.md - File structure reference",
        "FILE_STRUCTURE.md - Organization guide",
        "PHASE1_SUPABASE.md - Supabase implementation reference",
        "WHAT_TO_BUILD_NEXT.md - Development roadmap",
        "database-schema.sql - Database schema (CRITICAL)",
        "kill-port-3000.bat - Development utility",
        "kill-port-3000.ps1 - Development utility",
    ]
    
    for file in important_files:
        print(f"  ✓ {file}")
    
    print("\n✨ Your project is now cleaner and more organized!")

if __name__ == "__main__":
    remove_files()
