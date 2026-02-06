"""Comprehensive analysis of all remaining issues in GrowmindAI - Round 2.

This document identifies all issues found after Phase 2 fixes implementation.
"""

import os
import sys
from pathlib import Path

# Scan all Python files for issues
BACKEND_DIR = Path("/workspaces/GrowmindAI/backend/app")
FRONTEND_DIR = Path("/workspaces/GrowmindAI/frontend/src")

issues_found = []

def check_file(filepath, file_type="backend"):
    """Analyze a single file for common issues."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            lines = content.split('\n')
    except Exception as e:
        return [f"ERROR reading {filepath}: {e}"]
    
    local_issues = []
    issues_in_file = []
    
    # Check 1: Bare except clauses
    for i, line in enumerate(lines, 1):
        if re.match(r'\s*except\s*:\s*$', line):
            issues_in_file.append({
                'type': 'BARE_EXCEPT',
                'line': i,
                'severity': 'HIGH',
                'description': 'Bare except clause catches all exceptions (including SystemExit)',
                'details': line.strip()
            })
    
    # Check 2: Missing type hints
    if file_type == "backend":
        # Check function definitions
        for i, line in enumerate(lines, 1):
            if re.match(r'^\s*def\s+\w+\([^)]*\)\s*:', line):
                # Check if has -> return type
                if '->' not in line:
                    # Some exceptions allowed for very simple functions
                    if not any(x in line for x in ['__init__', '__', 'pass']):
                        issues_in_file.append({
                            'type': 'MISSING_TYPE_HINT',
                            'line': i,
                            'severity': 'MEDIUM',
                            'description': 'Function missing return type hint',
                            'details': line.strip()[:60]
                        })
    
    # Check 3: Hardcoded strings
    for i, line in enumerate(lines, 1):
        if 'Bearer' in line and 'Bearer {' not in line:
            issues_in_file.append({
                'type': 'HARDCODED_STRING',
                'line': i,
                'severity': 'MEDIUM',
                'description': 'Hardcoded Bearer string',
                'details': line.strip()
            })
    
    # Check 4: Magic numbers
    if file_type == "backend":
        for i, line in enumerate(lines, 1):
            # Look for magic numbers in common patterns
            if re.search(r'[^=\s]\s*[=<>]\s*\d{3,}[^\d]', line):
                if any(x in line for x in ['timeout', 'max', 'limit', 'size']):
                    if not re.search(r'(MIN|MAX|TIMEOUT|LIMIT)[_\w]*\s*[=:]', line):
                        issues_in_file.append({
                            'type': 'MAGIC_NUMBER',
                            'line': i,
                            'severity': 'LOW',
                            'description': 'Magic number should be constant',
                            'details': line.strip()[:60]
                        })
    
    return issues_in_file

import re

# Analyze all Python files
print("🔍 PHASE 2 ANALYSIS - Scanning for remaining issues...\n")

all_issues = {}

# Backend files
for py_file in BACKEND_DIR.glob("*.py"):
    if py_file.name == "__init__.py":
        continue
    file_issues = check_file(py_file, "backend")
    if file_issues:
        all_issues[str(py_file.relative_to(BACKEND_DIR.parent.parent))] = file_issues

# Report findings
print(f"✓ Scanned {len(list(BACKEND_DIR.glob('*.py')))} Python files")
print(f"\n📋 ISSUES SUMMARY:")
print("=" * 70)

if not all_issues:
    print("✅ No critical issues found in automated scan")
    print("\nNote: Some issues require semantic understanding, see detailed analysis below")
else:
    for filepath, issues in sorted(all_issues.items()):
        print(f"\n📁 {filepath}")
        for issue in issues:
            severity_icon = "🔴" if issue['severity'] == "CRITICAL" else "🟠" if issue['severity'] == "HIGH" else "🟡" if issue['severity'] == "MEDIUM" else "🔵"
            print(f"  {severity_icon} [{issue['severity']}] {issue['type']}")
            print(f"      Line {issue['line']}: {issue['description']}")
            if issue.get('details'):
                preview = issue['details'][:70]
                print(f"      Preview: {preview}...")

print("\n" + "=" * 70)
print("\nFor detailed semantic analysis, see CODE_REVIEW_2.md")

