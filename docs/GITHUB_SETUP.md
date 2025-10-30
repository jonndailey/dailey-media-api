# GitHub Repository Setup Guide

This guide helps you set up the GitHub repository for optimal project management of DMAPI.

## Prerequisites

1. **GitHub CLI Installation**
   ```bash
   # Already installed (verified with gh --version)
   gh --version
   ```

2. **GitHub Authentication**
   ```bash
   # Authenticate with GitHub
   gh auth login
   
   # Select:
   # - GitHub.com
   # - HTTPS
   # - Yes (authenticate Git with GitHub credentials)
   # - Login with a web browser
   ```

## Repository Configuration

### 1. Create Repository Labels

Run this script to create standardized labels:

```bash
#!/bin/bash
# Create DMAPI standard labels

# Feature Area Labels
gh label create "video" --color "1f77b4" --description "Video processing capabilities"
gh label create "audio" --color "ff7f0e" --description "Audio processing capabilities"
gh label create "documents" --color "2ca02c" --description "Document conversion and processing"
gh label create "images" --color "d62728" --description "Image processing and manipulation"
gh label create "ai" --color "9467bd" --description "AI/ML powered features"
gh label create "ocr" --color "8c564b" --description "Optical character recognition"
gh label create "analytics" --color "e377c2" --description "Usage tracking and reporting"
gh label create "security" --color "7f7f7f" --description "Authentication, authorization, compliance"
gh label create "api" --color "bcbd22" --description "REST API improvements"
gh label create "frontend" --color "17becf" --description "Web interface enhancements"

# Priority Labels
gh label create "priority-critical" --color "b60205" --description "Must fix immediately"
gh label create "priority-high" --color "d93f0b" --description "Important for next release"
gh label create "priority-medium" --color "fbca04" --description "Valuable enhancement"
gh label create "priority-low" --color "0e8a16" --description "Nice to have"

# Development Phase Labels
gh label create "q1-2025" --color "c2e0c6" --description "Planned for Q1 2025"
gh label create "q2-2025" --color "bfd4f2" --description "Planned for Q2 2025"
gh label create "q3-2025" --color "f9d0c4" --description "Planned for Q3 2025"
gh label create "backlog" --color "fef2c0" --description "Future consideration"

# Status Labels
gh label create "in-progress" --color "0052cc" --description "Currently being worked on"
gh label create "needs-review" --color "006b75" --description "Waiting for code review"
gh label create "needs-testing" --color "0e8a16" --description "Awaiting QA validation"
gh label create "blocked" --color "d73a4a" --description "Cannot proceed due to dependency"

# Epic Label
gh label create "epic" --color "5319e7" --description "Large feature initiative spanning multiple sprints"
```

### 2. Create Project Boards

1. **Main Roadmap Board**
   ```bash
   gh project create --title "DMAPI Roadmap" --body "High-level roadmap tracking for DMAPI universal media platform"
   ```

2. **Current Sprint Board**
   ```bash
   gh project create --title "Current Sprint" --body "Active sprint planning and task tracking"
   ```

### 3. Create Milestones

```bash
# Create quarterly milestones
gh api repos/:owner/:repo/milestones -f title="Q1 2025 - Media Processing Engine" -f description="Video, audio, and document processing capabilities" -f due_on="2025-03-31T23:59:59Z"

gh api repos/:owner/:repo/milestones -f title="Q2 2025 - Document Processing" -f description="Universal document conversion and OCR capabilities" -f due_on="2025-06-30T23:59:59Z"

gh api repos/:owner/:repo/milestones -f title="Q3 2025 - AI Integration" -f description="AI-powered content analysis and workflow automation" -f due_on="2025-09-30T23:59:59Z"

gh api repos/:owner/:repo/milestones -f title="Q4 2025 - Advanced Features" -f description="Collaboration tools, CDN integration, and enterprise features" -f due_on="2025-12-31T23:59:59Z"
```

## Creating Roadmap Issues

### Run the Issue Creation Script

```bash
# Make sure you're authenticated
gh auth status

# Run the roadmap issue creation script
./scripts/create-roadmap-issues.sh
```

This will create:
- 3 Epic issues for major initiatives
- 6 Feature issues for key capabilities
- Proper labels and organization

### Manual Issue Creation

If you prefer to create issues manually, use the templates in `.github/ISSUE_TEMPLATE/`:

1. Go to **Issues** → **New Issue**
2. Select **Epic** or **Feature Request** template
3. Fill in the required information
4. Add appropriate labels and milestone
5. Assign to project board

## Repository Settings

### Branch Protection

1. Go to **Settings** → **Branches**
2. Add rule for `main` branch:
   - Require pull request reviews (1 reviewer)
   - Require status checks to pass
   - Require branches to be up to date
   - Include administrators

### Required Status Checks

Set up GitHub Actions for:
- [ ] ESLint code quality
- [ ] Jest unit tests
- [ ] Security scanning
- [ ] Docker build validation

### Issue Templates

Already created in `.github/ISSUE_TEMPLATE/`:
- `feature_request.md` - For new features
- `task.md` - For concrete implementation tasks

### Import Backlog Items from docs/BACKLOG.md

Use the helper to turn the documented backlog into GitHub issues automatically:

```bash
# Dry run to preview the gh commands
./scripts/create-issues.sh --dry-run

# Create the issues
./scripts/create-issues.sh
```

The script reads `docs/BACKLOG.md` and creates issues titled by each backlog line (labelled `enhancement,api`). Adjust labels and bodies as needed in the script.

### Pull Request Template

Create `.github/pull_request_template.md`:

```markdown
## Description
Brief description of changes made.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Related Issues
Closes #issue_number

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings or errors
```

## Project Management Workflow

### Daily Operations

1. **Check Current Sprint Board**
   - Review in-progress issues
   - Update issue status
   - Identify blockers

2. **Issue Triage**
   - Review new issues
   - Add appropriate labels
   - Assign to milestones
   - Estimate effort

3. **Pull Request Management**
   - Review open PRs
   - Provide feedback
   - Merge approved changes

### Weekly Planning

1. **Sprint Planning** (Mondays)
   - Review milestone progress
   - Select issues for upcoming sprint
   - Update project board

2. **Roadmap Review** (Fridays)
   - Assess quarterly progress
   - Adjust priorities if needed
   - Update stakeholders

### Monthly Reviews

1. **Release Planning**
   - Prepare release notes
   - Create release milestone
   - Tag and deploy release

2. **Metrics Review**
   - Analyze velocity trends
   - Review issue completion rates
   - Assess quality metrics

## Automation Setup

### GitHub Actions Workflows

1. **CI/CD Pipeline** (`.github/workflows/ci.yml`)
   ```yaml
   name: CI/CD
   on: [push, pull_request]
   jobs:
     test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - name: Run tests
           run: npm test
   ```

2. **Issue Labeling** (`.github/workflows/label-issues.yml`)
   ```yaml
   name: Auto-label issues
   on:
     issues:
       types: [opened]
   jobs:
     label:
       runs-on: ubuntu-latest
       steps:
         - name: Add labels based on title
           uses: actions/github-script@v6
   ```

### Issue Templates Enhancement

Add custom fields to issue templates for better organization:
- Priority selection
- Effort estimation
- Component selection
- Testing requirements

## Next Steps

1. **Authenticate GitHub CLI**
   ```bash
   gh auth login
   ```

2. **Create Repository Labels**
   ```bash
   # Run the label creation script above
   ```

3. **Create Roadmap Issues**
   ```bash
   ./scripts/create-roadmap-issues.sh
   ```

4. **Set Up Project Boards**
   - Create boards for roadmap and sprint planning
   - Configure board columns and automation

5. **Configure Branch Protection**
   - Protect main branch
   - Require reviews and status checks

6. **Set Up Notifications**
   - Configure team notifications
   - Set up Slack/Discord webhooks if needed

With this setup, DMAPI will have a professional project management structure that scales with the team and provides clear visibility into development progress.
