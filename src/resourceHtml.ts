// Shared HTML rendering for resource details, used by both the sidebar view and the webview panel.

interface CostComponentDetail {
  name: string;
  unit: string;
  price: string;
  monthlyQuantity: string;
  monthlyCost: string;
}

interface PolicyDetail {
  risk?: string;
  effort?: string;
  downtime?: string;
  riskDescription?: string;
  effortDescription?: string;
  downtimeDescription?: string;
  additionalDetails?: string;
  shortTitle?: string;
}

interface ViolationDetail {
  policyName: string;
  message: string;
  blockPullRequest: boolean;
  monthlySavings?: string;
  policyDetail?: PolicyDetail;
}

interface TagViolationDetail {
  policyName: string;
  blockPR: boolean;
  message: string;
  missingTags?: string[];
  invalidTags?: {
    key: string;
    value: string;
    suggestion?: string;
    message?: string;
    validValues?: string[];
  }[];
}

export interface ResourceDetail {
  name: string;
  type: string;
  monthlyCost: string;
  costComponents: CostComponentDetail[];
  violations: ViolationDetail[];
  tagViolations: TagViolationDetail[];
}

export interface ResourceDetailsResult {
  resource?: ResourceDetail;
  scanning: boolean;
  needsLogin?: boolean;
}

export function renderPage(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    padding: 8px;
    margin: 0;
  }
  .state {
    text-align: center;
    padding: 24px 8px;
    color: var(--vscode-descriptionForeground);
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--vscode-widget-border);
  }
  .resource-name {
    font-weight: bold;
    word-break: break-all;
  }
  .resource-cost {
    font-weight: bold;
    white-space: nowrap;
    margin-left: 8px;
    color: var(--vscode-charts-green);
  }
  .section {
    margin-bottom: 12px;
  }
  .section summary {
    cursor: pointer;
    font-weight: bold;
    padding: 4px 0;
    user-select: none;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9em;
    margin-top: 4px;
  }
  th, td {
    text-align: left;
    padding: 3px 6px;
    border-bottom: 1px solid var(--vscode-widget-border);
  }
  .num { text-align: right; }
  .violation {
    padding: 8px;
    margin: 6px 0;
    border-radius: 4px;
    background: var(--vscode-editor-inactiveSelectionBackground);
  }
  .violation > summary {
    cursor: pointer;
    list-style: revert;
    user-select: none;
  }
  .violation > summary .badges {
    display: inline-flex;
    gap: 4px;
    flex-wrap: wrap;
    vertical-align: middle;
    margin-left: 4px;
  }
  .violation-message {
    margin-top: 4px;
    color: var(--vscode-foreground);
    line-height: 1.5;
  }
  .badges { display: flex; gap: 4px; flex-wrap: wrap; }
  .badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 0.8em;
    font-weight: 600;
    background: var(--vscode-editor-inactiveSelectionBackground);
  }
  .badge.blocking {
    background: var(--vscode-inputValidation-errorBackground);
    color: var(--vscode-inputValidation-errorForeground);
  }
  .badge.high { color: var(--vscode-editorError-foreground); }
  .badge.medium, .badge.yes { color: var(--vscode-editorWarning-foreground); }
  .badge.low, .badge.no { color: var(--vscode-charts-green); }
  a { color: var(--vscode-textLink-foreground); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .login-btn {
    display: inline-block;
    padding: 6px 14px;
    margin-top: 12px;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: var(--vscode-font-size);
    font-family: var(--vscode-font-family);
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .login-btn:hover { background: var(--vscode-button-hoverBackground); }
  .savings {
    margin-top: 4px;
    color: var(--vscode-charts-green);
    font-weight: 600;
  }
  .policy-details {
    margin-top: 6px;
    padding: 6px;
    border-radius: 3px;
    background: var(--vscode-editor-background);
    font-size: 0.9em;
    color: var(--vscode-foreground);
  }
  .detail-row { margin: 6px 0; line-height: 1.5; }
  .tag-list {
    margin-top: 4px;
    font-size: 0.9em;
    line-height: 1.5;
  }
  code {
    background: var(--vscode-textCodeBlock-background);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family);
  }
</style>
</head>
<body>${body}</body>
</html>`;
}

export function renderEmpty(): string {
  return renderPage(`<div class="state">No resource selected</div>`);
}

export function renderScanning(): string {
  return renderPage(`<div class="state">Scanning...</div>`);
}

export function renderLogin(): string {
  return renderPage(`<div class="state">
  <p>Login to Infracost Cloud to see Costs, FinOps policies, and Tagging issues.</p>
  <button class="login-btn" onclick="(function(){const vscode=acquireVsCodeApi();vscode.postMessage({command:'login'})})()">Login to Infracost</button>
</div>`);
}

export function renderResult(data: ResourceDetailsResult): string {
  if (data.scanning) {
    return renderScanning();
  }
  if (data.needsLogin) {
    return renderLogin();
  }
  if (!data.resource) {
    return renderEmpty();
  }
  return renderPage(renderResource(data.resource));
}

function renderResource(r: ResourceDetail): string {
  const parts: string[] = [];

  parts.push(`
    <div class="header">
      <div class="resource-name">${esc(r.name)}</div>
      <div class="resource-cost">${esc(r.monthlyCost)}/mo</div>
    </div>
  `);

  if (r.costComponents && r.costComponents.length > 0) {
    parts.push(`
      <details class="section" open>
        <summary>Cost Components</summary>
        <table>
          <thead><tr><th>Component</th><th>Qty</th><th>Unit</th><th>Price</th><th>Monthly</th></tr></thead>
          <tbody>
            ${r.costComponents
              .map(
                (c) => `
              <tr>
                <td>${esc(c.name)}</td>
                <td class="num">${esc(c.monthlyQuantity)}</td>
                <td>${esc(c.unit)}</td>
                <td class="num">${esc(c.price)}</td>
                <td class="num">${esc(c.monthlyCost)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </details>
    `);
  }

  if (r.violations && r.violations.length > 0) {
    parts.push(`
      <details class="section" open>
        <summary>FinOps Issues (${r.violations.length})</summary>
        ${r.violations.map((v) => renderViolation(v)).join('')}
      </details>
    `);
  }

  if (r.tagViolations && r.tagViolations.length > 0) {
    parts.push(`
      <details class="section" open>
        <summary>Tag Issues (${r.tagViolations.length})</summary>
        ${r.tagViolations.map((v) => renderTagViolation(v)).join('')}
      </details>
    `);
  }

  return parts.join('');
}

function renderViolation(v: ViolationDetail): string {
  const badges: string[] = [];
  if (v.blockPullRequest) {
    badges.push(`<span class="badge blocking">Blocking</span>`);
  }

  if (v.policyDetail?.risk) {
    const cls = v.policyDetail.risk.toLowerCase();
    badges.push(
      `<span class="badge ${cls}">Risk: ${esc(sentenceCase(v.policyDetail.risk))}</span>`
    );
  }
  if (v.policyDetail?.effort) {
    const cls = v.policyDetail.effort.toLowerCase();
    badges.push(
      `<span class="badge ${cls}">Effort: ${esc(sentenceCase(v.policyDetail.effort))}</span>`
    );
  }
  if (v.policyDetail?.downtime) {
    const cls = v.policyDetail.downtime.toLowerCase();
    badges.push(
      `<span class="badge ${cls}">Downtime: ${esc(sentenceCase(v.policyDetail.downtime))}</span>`
    );
  }

  let details = '';
  if (v.policyDetail) {
    const pd = v.policyDetail;
    const rows: string[] = [];
    if (pd.riskDescription) {
      rows.push(
        `<div class="detail-row"><strong>Risk</strong><div>${linkify(
          pd.riskDescription
        )}</div></div>`
      );
    }
    if (pd.effortDescription) {
      rows.push(
        `<div class="detail-row"><strong>Effort</strong><div>${linkify(
          pd.effortDescription
        )}</div></div>`
      );
    }
    if (pd.downtimeDescription) {
      rows.push(
        `<div class="detail-row"><strong>Downtime</strong><div>${linkify(
          pd.downtimeDescription
        )}</div></div>`
      );
    }
    if (pd.additionalDetails) {
      rows.push(`<div class="detail-row">${linkify(pd.additionalDetails)}</div>`);
    }
    if (rows.length > 0) {
      details = `<div class="policy-details">${rows.join('')}</div>`;
    }
  }

  const savings =
    v.monthlySavings && v.monthlySavings !== '$0.00'
      ? `<div class="savings">Potential savings: ${esc(
          v.monthlySavings.replace(/^-/, '')
        )}/mo</div>`
      : '';

  return `
    <details class="violation">
      <summary>
        <strong>${esc(v.policyDetail?.shortTitle || v.policyName)}</strong>
        <div class="badges">${badges.join('')}</div>
      </summary>
      <div class="violation-message">${linkify(v.message)}</div>
      ${savings}
      ${details}
    </details>
  `;
}

function renderTagViolation(v: TagViolationDetail): string {
  const badges: string[] = [];
  if (v.blockPR) {
    badges.push(`<span class="badge blocking">Blocking</span>`);
  }

  let tagList = '';
  if (v.missingTags && v.missingTags.length > 0) {
    tagList += `<div class="tag-list"><strong>Missing:</strong> ${v.missingTags
      .map((t) => `<code>${esc(t)}</code>`)
      .join(', ')}</div>`;
  }
  if (v.invalidTags && v.invalidTags.length > 0) {
    tagList += v.invalidTags
      .map(
        (t) =>
          `<div class="tag-list"><strong>${esc(t.key)}:</strong> <code>${esc(t.value)}</code>${
            t.suggestion ? ` (suggestion: <code>${esc(t.suggestion)}</code>)` : ''
          }${
            t.validValues && t.validValues.length > 0
              ? `<div class="tag-list">Valid values: ${t.validValues
                  .map((val) => `<code>${esc(val)}</code>`)
                  .join(', ')}</div>`
              : ''
          }</div>`
      )
      .join('');
  }

  return `
    <div class="violation">
      <div class="violation-header">
        <strong>${esc(v.policyName)}</strong>
        <div class="badges">${badges.join('')}</div>
      </div>
      <div class="violation-message">${linkify(v.message)}</div>
      ${tagList}
    </div>
  `;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sentenceCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function linkify(s: string): string {
  return esc(s)
    .replace(/&lt;a href=&quot;(.*?)&quot;(.*?)&gt;(.*?)&lt;\/a&gt;/g, (_, url, _attrs, text) => {
      const href = url.replace(/&amp;/g, '&');
      if (!/^https?:\/\//i.test(href)) {
        return text;
      }
      return `<a href="${url}">${text}</a>`;
    })
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}
