import { spawn } from 'child_process';

export namespace infracostJSON {
  export interface Metadata {
    path: string;
    type: string;
    vcsRepoUrl: string;
    vcsSubPath: string;
  }

  export interface PastBreakdown {
    resources: Resource[];
    totalHourlyCost: string;
    totalMonthlyCost: string;
  }

  export interface ResourceMetadata {
    filename: string;
    startLine: number;
    calls: Call[];
  }

  export interface Call {
    blockName: string;
    filename: string;
    startLine: number;
  }

  export interface CostComponent {
    name: string;
    unit: string;
    hourlyQuantity: number;
    monthlyQuantity: number;
    price: string;
    hourlyCost: number;
    monthlyCost: number;
  }

  export interface Resource {
    name: string;
    metadata: ResourceMetadata;
    hourlyCost: string;
    monthlyCost: number;
    costComponents: CostComponent[];
    subresources: Resource[];
  }

  export interface Breakdown {
    resources: Resource[];
    totalHourlyCost: string;
    totalMonthlyCost: string;
  }

  export interface Diff {
    resources: Resource[];
    totalHourlyCost: string;
    totalMonthlyCost: string;
  }

  export interface Summary {
    totalDetectedResources: number;
    totalSupportedResources: number;
    totalUnsupportedResources: number;
    totalUsageBasedResources: number;
    totalNoPriceResources: number;
    unsupportedResourceCounts: Record<string, number>;
    noPriceResourceCounts: Record<string, number>;
  }

  export interface Project {
    name: string;
    metadata: Metadata;
    pastBreakdown: PastBreakdown;
    breakdown: Breakdown;
    diff: Diff;
    summary: Summary;
  }

  export interface RootObject {
    version: string;
    currency: string;
    projects: Project[];
    totalHourlyCost: string;
    totalMonthlyCost: string;
    pastTotalHourlyCost: string;
    pastTotalMonthlyCost: string;
    diffTotalHourlyCost: string;
    diffTotalMonthlyCost: string;
    timeGenerated: Date;
    summary: Summary;
  }
}

type CLIOutput = {
  stderr: string;
  stdout: string;
};

export default class CLI {
  constructor(private binaryPath: string) {}

  async exec(args: string[], cwd?: string): Promise<CLIOutput> {
    const cmd = spawn(this.binaryPath, args, {
      cwd,
      env: {
        ...process.env,
        INFRACOST_CLI_PLATFORM: 'vscode',
        INFRACOST_NO_COLOR: 'true',
        INFRACOST_SKIP_UPDATE_CHECK: 'true',
      },
    });

    return new Promise((resolve) => {
      const stdOut: Uint8Array[] = [];
      const stdErr: Uint8Array[] = [];

      cmd.stdout.on('data', (data) => {
        stdOut.push(data);
      });

      cmd.stderr.on('data', (data) => {
        stdErr.push(data);
      });

      cmd.on('close', () => {
        resolve({
          stdout: Buffer.concat(stdOut).toString(),
          stderr: Buffer.concat(stdErr).toString(),
        });
      });
    });
  }
}
