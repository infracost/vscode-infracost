# Infracost VS Code Extension

Infracost's VS Code extension shows you cost estimates for Terraform right in your editor! Prevent costly infrastructure changes before they get into production.

This helps with a few use-cases:
- **Compare configs, instance types, regions etc**: copy/paste a code block, make changes and compare them.
- **Quick cost estimate**: write a code block and get a cost estimate without having to use AWS, Azure or Google cost calculators, or read the long/complicated pricing web pages.
- **Catch costly typos**: if you accidentally type 22 instead of 2 as the instance count, or 1000GB volume size instead of 100, the cost estimate will immediately pick that up and let you know.

## Features

See cost estimates right above their Terraform definitions. Infracost's output updates on file save.

![](https://github.com/infracost/vscode-infracost/blob/master/.github/assets/resources.gif?raw=true)

### Works with resources and modules

Both `resource` and `module` blocks are supported. **3rd party module blocks** are also supported!

![](https://github.com/infracost/vscode-infracost/blob/master/.github/assets/modules.gif?raw=true)

### See cost breakdown

If a simple monthly cost isn't enough for you, just click the overview to see a cost breakdown.

![](https://github.com/infracost/vscode-infracost/blob/master/.github/assets/webview.gif?raw=true)

### Navigate your projects by costs

See a tree overview of your Infrastructure costs. See which projects, files and blocks have the most impact to your budget.

![](https://github.com/infracost/vscode-infracost/blob/master/.github/assets/tree-view.gif?raw=true)

## Get started

### 1. Install VS Code extension

Open VS Code and install the [Infracost extension](https://marketplace.visualstudio.com/items?itemName=Infracost.infracost).

This will also install the the [Hashicorp Terraform extension](https://marketplace.visualstudio.com/items?itemName=HashiCorp.terraform) extension if you don't already have it.
   ![](https://github.com/infracost/vscode-infracost/blob/master/.github/assets/infracost-install.png?raw=true)

### 2. Connect VS Code to Infracost

Once you've installed the extension, you'll need to connect to your editor to your Infracost account. Click the "connect to Infracost" button in the Infracost sidebar.

 ![](https://github.com/infracost/vscode-infracost/blob/master/.github/assets/connect-to-cloud.png?raw=true)

This will open a browser window where you'll be able to log in to Infracost Cloud and authenticate your editor. 

### 3. Use extension

If you've done the prior steps correctly you'll should now see the Infracost sidebar, showing the costs of the auto-detected Terraform projects within your workspace.

![](https://github.com/infracost/vscode-infracost/blob/master/.github/assets/tree-view.gif?raw=true)

### 4. Create a Infracost config file

Whilst the Infracost VS Code extension supports auto-detecting projects, this is normally only recommended to get up and running. To get Infracost showing accurate project costs, you'll need to add an Infracost config file at the root of your workspace. This defines the Terraform projects within your workspace and how Infracost should handle them. For example:

```yaml
version: 0.1
projects:
  - path: dev
    name: development
    usage_file: dev/infracost-usage.yml
    terraform_var_files:
      - dev.tfvars

  - path: prod
    name: production
    usage_file: prod/infracost-usage.yml
    terraform_vars:
      instance_count: 5
      artifact_version: foobar
```

You can read more about how the config file works and which fields it supports by reading our [dedicated documentation](https://www.infracost.io/docs/features/config_file/).

When adding a config file to your workspace, it must be placed at the **root directory** of your workspace, and named either `infracost.yml` for a static config file or `infracost.yml.tmpl` for a [dynamic config files](https://www.infracost.io/docs/features/config_file/#dynamic-config-files).

### 5. Cost estimates in pull requests

[Use our CI/CD integrations](https://www.infracost.io/docs/integrations/cicd/) to add cost estimates to pull requests. This provides your team with a safety net as people can understand cloud costs upfront, and discuss them as part of your workflow.

![](https://github.com/infracost/vscode-infracost/blob/master/.github/assets/cicd-integration.png?raw=true)

## Requirements

The Infracost VS Code extension requires you to have:

* VS Code **v1.67.0** or above.
* The [Terraform VS Code extension](https://marketplace.visualstudio.com/items?itemName=HashiCorp.terraform) installed and enabled in VS Code.

## FAQs

### How can I supply input variables to Infracost VS Code extension?

To supply input variables for your Terraform projects, we recommend you add a [config file](https://www.infracost.io/docs/features/config_file/). Config files allow you to add any number of variable files for defined projects. Infracost also auto-detects any var files called `terraform.tfvars`, or `*.auto.tfvars` at the root level of your Terraform projects. e.g:

```yaml
version: 0.1
projects:
  - path: dev
    name: development
    usage_file: dev/infracost-usage.yml
    terraform_var_files:
      - dev.tfvars
      - global.tfvars
```

Both HCL and JSON var files are supported, JSON var files must include a `.json` suffix.

### How do I supply a usage file to the Infracost VS Code extension?

To supply input variables for your Terraform projects, we recommend you add a [config file](https://www.infracost.io/docs/features/config_file/). Config files allow you to define a usage file for each project you specify, e.g:

```yaml
version: 0.1
projects:
  - path: dev
    usage_file: dev/infracost-usage.yml
  - path: prod
    usage_file: prod/infracost-usage.yml
```

### I see a lot of resources showing $0.00 costs, why is this?

These resources are likely usage-based resources. For example, AWS Lambda is billed per request, so unless you specify the number of requests that the function receives. You're likely to see a message similar to the following: " Cost depends on usage: $0.20 per 1M requests" in the resource breakdown.

To specify usage for resources, add a [usage file](https://www.infracost.io/docs/features/usage_based_resources/#specify-usage-manually) and reference it in a [config file](https://www.infracost.io/docs/features/config_file/) you add at the root of your workspace.

### How can I configure the currency Infracost uses?

If you have the `infracost` CLI installed, you can set the currency by running `infracost configure set currency EUR` (check `infracost configure --help` for other configuration options). Otherwise, update the global infracost configuration file (found at `~/.config/infracost/configuration.yml`) with the following:

```yaml
version: "0.1"
currency: EUR
```

Infracost supports all ISO 4217 currency codes. [This FAQ](https://www.infracost.io/docs/faq/#can-i-show-costs-in-a-different-currency) has more details.

## Troubleshooting

### Known Issues

* The extension is not designed to work in the context of a **multi-repo workspace**. We recommend opening one repo per workspace.
* When opening a workspace with a large number of Terraform projects for the first time. Infracost will evaluate all the projects and download any required modules. This means
  that it might take some time before pricing information is available. If you're worried that Infracost VS Code extension isn't working in your workspace but haven't got
  any error messages, it is likely that Infracost is still indexing your workspace. The extension has a status bar on the right-hand side of the editor which will show a loading state
  when Infracost is running.

  ![](https://github.com/infracost/vscode-infracost/blob/master/.github/assets/loading.png?raw=true)  
* Terragrunt is not supported. Follow [this issue](https://github.com/infracost/vscode-infracost/issues/4) for more information for future updates about Terragrunt support.
* [Diff functionality](https://www.infracost.io/docs/features/cli_commands/#diff) is not yet supported. Follow [this issue](https://github.com/infracost/vscode-infracost/issues/8) to receive updates on diff support.

### Locating Infracost error logs

If you're having problems with the extension and your problem isn't any of the **known issues** above, you can find the Infracost extension logs using the following method:

1. Open the extension terminal using the top menu (Terminal->New Terminal)
2. Select **Output** and **Infracost Debug** from the dropdown.
   ![](https://github.com/infracost/vscode-infracost/blob/master/.github/assets/infracost-debug-log.png?raw=true)
3. There are sometimes additional CLI logs hidden in the **log (Window)** output.
   ![](https://github.com/infracost/vscode-infracost/blob/master/.github/assets/error-logs.png?raw=true)

The log there might give you more information for a problem you can fix on your own, e.g. syntax errors. If it's something more ominous please [raise an issue](https://github.com/infracost/vscode-infracost/issues), so that we can identify and fix the problem. Please include as much of the log information as you can and any other helpful information like OS and VS Code workspace size.

## Contributing

We love any contribution, big or small. If you want to change the Infracost VS Code extension, we recommend you use VS Code to build and develop the extension locally.

1. Clone the repo.
2. `yarn` install all the dependencies.
3. Open the repo in VS Code.
4. Install the [Terraform VS Code extension](https://marketplace.visualstudio.com/items?itemName=HashiCorp.terraform) in VS Code.
5. Inside the editor, press F5. VS Code will compile and run the extension in a new Development Host window.
6. Open a Terraform project, and navigate to a valid file. If all the previous steps have been followed correctly, you should see Infracost cost estimates above supported resource blocks.

Once you're finished with your work, open a PR, and we'll be happy to review it as soon as possible. 
