# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.37.0] - 2025-12-05

### Added
- **Docker Support**: Full Docker and Docker Compose support for containerized deployments
  - Multi-stage Dockerfile with optimized production image
  - Docker Compose configuration with persistent volumes
  - Pre-configured Chromium with all required dependencies
  - Non-root user for enhanced security
  - `docker-example.js` - Complete Docker-ready bot example
  - `.dockerignore` for optimized builds

## [1.36.0] - 2025-12-05

### Added
- **RateLimiter**: Token bucket rate limiter for API calls to prevent hitting WhatsApp rate limits
- **MessageScheduler**: Schedule messages to be sent at a specific future time with events for sent/failed/cancelled
- **RetryHandler**: Enhanced error handling with exponential backoff and configurable retry logic
- **WebhookManager**: Send events to external HTTP endpoints with signature verification support
- **MessageQueue**: Priority-based message queue with concurrency control for bulk messaging
- **Logger**: Comprehensive logging system with multiple levels, transports, and log history

## [1.35.0] - 2025-12-05

### Changed
- **BREAKING**: Updated minimum Node.js requirement from v18 to v20
- Updated puppeteer from v18.2.1 to v24.6.0 (Chrome 131+ support)
- Updated mime from v3.0.0 to v4.0.6
- Updated node-fetch from v2.6.9 to v2.7.0
- Updated node-webpmux from v3.1.7 to v3.2.1
- Updated archiver from v5.3.1 to v7.0.1
- Updated fs-extra from v10.1.0 to v11.3.0
- Updated unzipper from v0.10.11 to v0.12.3
- Updated eslint from v8.4.1 to v8.57.1
- Updated mocha from v9.0.2 to v10.8.2
- Updated chai from v4.3.4 to v4.5.0
- Updated sinon from v13.0.1 to v19.0.2
- Updated jsdoc from v3.6.4 to v4.0.4
- Updated dotenv from v16.0.0 to v16.4.7
- Updated user agent to Chrome 131
- Moved fluent-ffmpeg to optional dependencies
- Updated repository URL to forked repo

### Added
- Added ffmpeg-static as optional dependency for easier setup
- Added deprecation warnings to Buttons and List classes (no longer supported by WhatsApp)
- Added lint script to package.json

### Fixed
- Fixed typo in example.js (approveGroupMembershipRequestss -> approveGroupMembershipRequests)

### Deprecated
- Buttons class is deprecated (WhatsApp no longer supports buttons)
- List class is deprecated (WhatsApp no longer supports lists)

## [1.34.2] - Previous version

See the original repository for previous changelog entries.
