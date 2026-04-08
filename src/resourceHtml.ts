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
  policyMessage?: string;
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

export interface StatusInfo {
  version: string;
  workspaceRoot: string;
  loggedIn: boolean;
  scanning: boolean;
  projectCount: number;
  projectNames: string[];
  resourceCount: number;
  violationCount: number;
  tagIssueCount: number;
  configFound: boolean;
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
    position: relative;
    min-height: 100vh;
    box-sizing: border-box;
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
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-top: 4px;
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
  .tag-message {
    margin-top: 2px;
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
  }
  .policy-message {
    margin-top: 4px;
    font-size: 0.9em;
  }
  code {
    background: var(--vscode-textCodeBlock-background);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family);
  }
  .empty-links {
    position: absolute;
    bottom: 16px;
    left: 8px;
    right: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.9em;
  }
  .empty-links a {
    color: var(--vscode-textLink-foreground);
    text-decoration: none;
  }
  .empty-links a:hover { text-decoration: underline; }
  .login-status {
    margin-top: 4px;
    font-size: 0.9em;
  }
  .issue-list {
    list-style: none;
    padding: 0;
    margin: 6px 0 0 0;
  }
  .issue-list li {
    padding: 4px 0;
    border-bottom: 1px solid var(--vscode-widget-border);
  }
  .issue-list li:last-child { border-bottom: none; }
  .issue-list a {
    color: var(--vscode-foreground);
    text-decoration: none;
    display: block;
    font-size: 0.9em;
    line-height: 1.4;
  }
  .issue-list a:hover { color: var(--vscode-textLink-foreground); }
  .resource-link-name {
    word-break: break-all;
  }
  .back-nav {
    margin-bottom: 8px;
  }
  .back-nav a {
    color: var(--vscode-textLink-foreground);
    text-decoration: none;
    font-size: 0.9em;
  }
  .back-nav a:hover { text-decoration: underline; }
  .status-table { font-size: 0.9em; }
  .status-table td:first-child {
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    padding-right: 12px;
  }
  .status-table td { border-bottom: none; }
  .project-list {
    list-style: none;
    padding: 0;
    margin: 4px 0 0 0;
    font-size: 0.9em;
  }
  .project-list li { padding: 2px 0; }
  .status-indicators {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.9em;
  }
  .copilot-fix {
    display: flex;
    justify-content: flex-end;
    margin-top: 8px;
  }
  .copilot-fix-btn {
    display: inline-block;
    padding: 3px 8px;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.85em;
    font-family: var(--vscode-font-family);
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .copilot-fix-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
</style>
</head>
<body>${body}
<script>
(function() {
  const vscode = acquireVsCodeApi();
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('.copilot-fix-btn');
    if (btn) {
      vscode.postMessage({ command: 'fixWithCopilot', prompt: btn.dataset.prompt });
    }
  });
  document.addEventListener('infracost', function(e) {
    vscode.postMessage(e.detail);
  });
})();
</script>
</body>
</html>`;
}

export interface FileSummaryResource {
  name: string;
  line: number;
  monthlyCost: string;
  policyIssues: number;
  tagIssues: number;
}

export function renderEmpty(loggedIn?: boolean, resources?: FileSummaryResource[]): string {
  let statusText = '';
  if (loggedIn === true) {
    statusText = '<span style="color:var(--vscode-charts-green);">● Logged in</span>';
  } else if (loggedIn === false) {
    statusText = '<span style="color:var(--vscode-descriptionForeground);">○ Not logged in</span>';
  }

  let resourcesHtml = '';
  if (resources && resources.length > 0) {
    const items = resources
      .map((r) => {
        const badges: string[] = [];
        badges.push(`<span class="badge">${esc(r.monthlyCost)}/mo</span>`);
        if (r.policyIssues > 0) {
          badges.push(`<span class="badge high">${r.policyIssues} policy</span>`);
        }
        if (r.tagIssues > 0) {
          badges.push(`<span class="badge medium">${r.tagIssues} tag</span>`);
        }
        return `<li><a href="#" onclick="document.dispatchEvent(new CustomEvent('infracost',{detail:{command:'revealResource',uri:'',line:${
          r.line
        }}}));return false;"><div class="resource-link-name">${esc(
          r.name
        )}</div><div class="badges">${badges.join('')}</div></a></li>`;
      })
      .join('');
    resourcesHtml = `<div class="section"><strong>Resources</strong><ul class="issue-list">${items}</ul></div>`;
  }

  return renderPage(`${resourcesHtml || '<div class="state">No resource selected</div>'}
<div class="empty-links">
  <a href="#" onclick="document.dispatchEvent(new CustomEvent('infracost',{detail:{command:'troubleshoot'}}));return false;">Troubleshooting</a>
  <a href="https://infracost.io/community-chat">Join the Slack</a>
  <a href="https://github.com/infracost/vscode-infracost/discussions">Raise an issue</a>
  ${statusText ? `<div class="login-status">${statusText}</div>` : ''}
</div>`);
}

export function renderScanning(): string {
  return renderPage(`<div class="state">Scanning...</div>`);
}

export function renderLogin(): string {
  return renderPage(`<div class="state">
  <p>Login to Infracost Cloud to see Costs, FinOps policies, and Tagging issues.</p>
  <button class="login-btn" onclick="document.dispatchEvent(new CustomEvent('infracost',{detail:{command:'login'}}))">Login to Infracost</button>
</div>
<div class="empty-links">
  <a href="#" onclick="document.dispatchEvent(new CustomEvent('infracost',{detail:{command:'troubleshoot'}}));return false;">Troubleshooting</a>
  <a href="https://infracost.io/community-chat">Join the Slack</a>
  <a href="https://github.com/infracost/vscode-infracost/discussions">Raise an issue</a>
</div>`);
}

export function renderTroubleshooting(status: StatusInfo): string {
  const serverStatus = status.version
    ? '<span style="color:var(--vscode-charts-green);">● Server running</span>'
    : '<span style="color:var(--vscode-editorError-foreground);">● Server not running</span>';

  const loginStatus = status.loggedIn
    ? '<span style="color:var(--vscode-charts-green);">● Logged in</span>'
    : '<span style="color:var(--vscode-descriptionForeground);">○ Not logged in</span> — <a href="#" onclick="document.dispatchEvent(new CustomEvent(\'infracost\',{detail:{command:\'login\'}}));return false;">Login</a>';

  const configStatus = status.configFound
    ? `Found (${status.projectCount} project${status.projectCount !== 1 ? 's' : ''})`
    : '<span style="color:var(--vscode-editorWarning-foreground);">Not found</span>';

  const projects =
    status.projectNames && status.projectNames.length > 0
      ? status.projectNames.map((n) => `<li>${esc(n)}</li>`).join('')
      : '<li style="color:var(--vscode-descriptionForeground);">None</li>';

  return renderPage(`
<div class="back-nav"><a href="#" onclick="document.dispatchEvent(new CustomEvent('infracost',{detail:{command:'back'}}));return false;">&larr; Back</a></div>
<div class="section status-indicators">
  <div>${serverStatus}</div>
  <div>${loginStatus}</div>
</div>
<div class="section">
  <strong>Details</strong>
  <table class="status-table">
    <tr><td>Server version</td><td>${esc(status.version || 'N/A')}</td></tr>
    <tr><td>Workspace</td><td>${esc(status.workspaceRoot || 'Not set')}</td></tr>
    <tr><td>Scan</td><td>${esc(status.scanning ? 'In progress' : 'Idle')}</td></tr>
    <tr><td>Config</td><td>${configStatus}</td></tr>
    <tr><td>Resources</td><td>${status.resourceCount}</td></tr>
    <tr><td>Policy issues</td><td>${status.violationCount}</td></tr>
    <tr><td>Tag issues</td><td>${status.tagIssueCount}</td></tr>
  </table>
</div>
<div class="section">
  <strong>Projects</strong>
  <ul class="project-list">${projects}</ul>
</div>
<div class="section">
  <strong>Actions</strong>
  <ul class="project-list">
    <li><a href="#" onclick="document.dispatchEvent(new CustomEvent('infracost',{detail:{command:'restartLsp'}}));return false;">Restart language server</a></li>
    <li><a href="#" onclick="document.dispatchEvent(new CustomEvent('infracost',{detail:{command:'viewLogs'}}));return false;">View logs</a></li>
    <li><a href="#" onclick="document.dispatchEvent(new CustomEvent('infracost',{detail:{command:'generateBundle'}}));return false;">Generate support bundle</a></li>
  </ul>
</div>
`);
}

export function renderResult(
  data: ResourceDetailsResult,
  copilotAvailable: boolean,
  resources?: FileSummaryResource[]
): string {
  if (data.scanning) {
    return renderScanning();
  }
  if (data.needsLogin) {
    return renderLogin();
  }
  if (!data.resource) {
    return renderEmpty(!data.needsLogin, resources);
  }
  return renderPage(renderResource(data.resource, copilotAvailable));
}

function renderResource(r: ResourceDetail, copilotAvailable: boolean): string {
  const parts: string[] = [];

  parts.push(
    `<div class="back-nav"><a href="#" onclick="document.dispatchEvent(new CustomEvent('infracost',{detail:{command:'back'}}));return false;">&larr; Back</a></div>`
  );

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
        ${r.violations.map((v) => renderViolation(v, r.name, copilotAvailable)).join('')}
      </details>
    `);
  }

  if (r.tagViolations && r.tagViolations.length > 0) {
    parts.push(`
      <details class="section" open>
        <summary>Tag Issues (${r.tagViolations.length})</summary>
        ${r.tagViolations.map((v) => renderTagViolation(v, r.name, copilotAvailable)).join('')}
      </details>
    `);
  }

  return parts.join('');
}

function renderViolation(
  v: ViolationDetail,
  resourceName: string,
  copilotAvailable: boolean
): string {
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

  let copilotBtn = '';
  if (copilotAvailable) {
    const promptParts = [
      `Fix the following FinOps policy violation on resource "${resourceName}":`,
      v.message,
    ];
    if (v.policyDetail?.additionalDetails) {
      promptParts.push(v.policyDetail.additionalDetails);
    }
    const prompt = promptParts.join('\n\n');
    copilotBtn = `<div class="copilot-fix"><button class="copilot-fix-btn" data-prompt="${escAttr(
      prompt
    )}">Fix with Copilot</button></div>`;
  }

  return `
    <details class="violation">
      <summary>
        <strong>${esc(v.policyDetail?.shortTitle || v.policyName)}</strong>
        <div class="badges">${badges.join('')}</div>
      </summary>
      <div class="violation-message">${linkify(v.message)}</div>
      ${savings}
      ${details}
      ${copilotBtn}
    </details>
  `;
}

function renderTagViolation(
  v: TagViolationDetail,
  resourceName: string,
  copilotAvailable: boolean
): string {
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
            t.message ? `<div class="tag-message">${esc(t.message)}</div>` : ''
          }${t.suggestion ? ` (suggestion: <code>${esc(t.suggestion)}</code>)` : ''}${
            t.validValues && t.validValues.length > 0
              ? `<div class="tag-list">Valid values: ${t.validValues
                  .map((val) => `<code>${esc(val)}</code>`)
                  .join(', ')}</div>`
              : ''
          }</div>`
      )
      .join('');
  }

  let copilotBtn = '';
  if (copilotAvailable) {
    const promptParts = [`Fix the following tag policy violation on resource "${resourceName}":`];
    if (v.missingTags && v.missingTags.length > 0) {
      promptParts.push(v.missingTags.map((t) => `Tag "${t}" is required but missing.`).join('\n'));
    }
    if (v.invalidTags && v.invalidTags.length > 0) {
      for (const t of v.invalidTags) {
        let line = `Tag "${t.key}" has an invalid value "${t.value}".`;
        if (t.message) {
          line += ` ${t.message}`;
        }
        if (t.validValues && t.validValues.length > 0) {
          line += ` Valid values: ${t.validValues.join(', ')}.`;
        }
        promptParts.push(line);
      }
    }
    if (v.policyMessage) {
      promptParts.push(v.policyMessage);
    }
    const prompt = promptParts.join('\n\n');
    copilotBtn = `<div class="copilot-fix"><button class="copilot-fix-btn" data-prompt="${escAttr(
      prompt
    )}">Fix with Copilot</button></div>`;
  }

  return `
    <div class="violation">
      <div class="violation-header">
        <strong>${esc(v.policyName)}</strong>
        <div class="badges">${badges.join('')}</div>
      </div>
      ${v.policyMessage ? `<div class="policy-message">${esc(v.policyMessage)}</div>` : ''}
      <div class="violation-message">${linkify(v.message)}</div>
      ${tagList}
      ${copilotBtn}
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

function escAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '&#10;');
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
