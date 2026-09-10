# Security

## Reporting

Please use GitHub private vulnerability reporting for this repository. Do not
open a public issue for a suspected vulnerability, credential exposure, unsafe
HTML, or cross-origin message flaw.

Include the affected revision, browser, reproduction steps, impact, and any
minimal proof of concept. Do not include real credentials or personal data.

## Scope

The viewer is static browser code. Its security-sensitive boundaries are:

- `postMessage` input validation and origin handling in embedding hosts;
- dependency and build supply chain;
- extraction tooling that reads an external PDF;
- accidental publication of source documents, local paths, or secrets.

The viewer intentionally accepts only renderer state. It does not issue device
commands, access serial ports, or load remote scripts at runtime.
