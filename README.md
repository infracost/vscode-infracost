# Infracost VSCode Extension

Infracost's VSCode extension shows you cost estimates for Terraform right in your editor! Prevent costly infrastructure changes before they get into production.

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

## Get started

### 1. Install Infracost CLI

Follow [this step](https://www.infracost.io/docs/#1-install-infracost) to install the Infracost CLI, which is used by this VSCode extension.

### 2. Get an API key

Follow [this step](https://www.infracost.io/docs/#2-get-api-key) to get a free API key that's used by the CLI to get prices from our Cloud Pricing API, e.g. get prices for instance types.

- No cloud credentials or secrets are [sent](https://www.infracost.io/docs/faq/#what-data-is-sent-to-the-cloud-pricing-api) to the API and you can also [self-host](https://www.infracost.io/docs/cloud_pricing_api/self_hosted/) it.
- Infracost does not make any changes to your Terraform state or cloud resources.

### 3. Install VSCode extension

Open VSCode and install the [Infracost extension](https://marketplace.visualstudio.com/items?itemName=Infracost.infracost).

This will also install the the [Hashicorp Terraform extension](https://marketplace.visualstudio.com/items?itemName=HashiCorp.terraform) extension if you don't already have it.
   ![](https://github.com/infracost/vscode-infracost/blob/master/.github/assets/infracost-install.png?raw=true)

### 4. Use extension

Navigate to any Terraform file, if you've done the prior steps correctly you'll see costs above [supported blocks](https://www.infracost.io/docs/supported_resources/overview/).
   ![](https://github.com/infracost/vscode-infracost/blob/master/.github/assets/maintf.png?raw=true)

### 5. Cost estimates in pull requests

[Use our CI/CD integrations](https://www.infracost.io/docs/integrations/cicd/) to add cost estimates to pull requests. This provides your team with a safety net as people can understand cloud costs upfront, and discuss them as part of your workflow.

![](https://github.com/infracost/vscode-infracost/blob/tweaks/.github/assets/cicd-integration.png?raw=true)

## Requirements

The Infracost VSCode extension requires you to have:

* VSCode **v1.67.0** or above.
* Infracost CLI version **v0.10.6** or above [installed](https://www.infracost.io/docs) and registered with a valid API key.
* The [Terraform VSCode extension](https://marketplace.visualstudio.com/items?itemName=HashiCorp.terraform) installed and enabled in VSCode.

## FAQs

### How can I supply input variables to Infracost VSCode extension?

To supply input variables for your Terraform projects, you must include a var file called `terraform.tfvars` at the root level of your Terraform project.
Alternatively, you can use several files with the suffix `*.auto.tfvars`, e.g. `dev.auto.tfvars` or `prod.auto.tfvars`. Currently, only HCL variable files are supported
you can follow [this issue](https://github.com/infracost/infracost/issues/1773) for updates on support for JSON variable files.

### How can I configure the currency Infracost uses?

To set the currency, run `infracost configure set currency EUR` (or any other ISO 4217 currency code). [This FAQ](https://www.infracost.io/docs/faq/#can-i-show-costs-in-a-different-currency) has more details.

## Troubleshooting

### Known Issues

* When opening a workspace with a large number of Terraform projects for the first time. Infracost will evaluate all the projects and download any required modules. This means
  that it might take some time before pricing information is available. If you're worried that Infracost VSCode extension isn't working in your workspace but haven't got
  any error messages, it is likely that Infracost is still indexing your workspace. The extension has a status bar on the right-hand side of the editor which will show a loading state
  when Infracost is running.

  ![](https://github.com/infracost/vscode-infracost/blob/master/.github/assets/loading.png?raw=true)  
* Terragrunt is not supported. Follow [this issue](https://github.com/infracost/vscode-infracost/issues/4) for more information for future updates about Terragrunt support.
* Infracost [usage files](https://www.infracost.io/docs/features/usage_based_resources/) are not yet supported. This means that resources that solely use usage costs will have a `0.00` cost shown:
 
  ![](https://github.com/infracost/vscode-infracost/blob/master/.github/assets/zero-cost.png?raw=true)

  Follow [this issue](https://github.com/infracost/vscode-infracost/issues/6) to receive updates on usage file support.
* [Diff functionality](https://www.infracost.io/docs/features/cli_commands/#diff) is not yet supported. Follow [this issue](https://github.com/infracost/vscode-infracost/issues/8) to receive updates on diff support.
* VSCode Infracost does not yet work with Infracost [config files](https://www.infracost.io/docs/features/config_file/). Multi project support is available using Infracost native auto-detection.
  This means that the first time running in a multi-project workspace might be quite slow. Follow [this issue](https://github.com/infracost/vscode-infracost/issues/7) to receive updates on config file support.

### Locating Infracost error logs

If you're having problems with the extension and your problem isn't any of the **known issues** above, you can find the Infracost extension logs using the following method:

1. Open the extension terminal using the top menu (Terminal->New Terminal)
2. Select **Output** and **Infracost Debug** from the dropdown.
   ![](https://github.com/infracost/vscode-infracost/blob/master/.github/assets/infracost-debug-log.png?raw=true)
3. There are sometimes additional CLI logs hidden in the **log (Window)** output.
   ![](https://github.com/infracost/vscode-infracost/blob/master/.github/assets/error-logs.png?raw=true)

The log there might give you more information for a problem you can fix on your own, e.g. syntax errors. If it's something more ominous please [raise an issue](https://github.com/infracost/vscode-infracost/issues), so that we can identify and fix the problem. Please include as much of the log information as you can and any other helpful information like OS and VSCode workspace size.

## Contributing

We love any contribution, big or small. If you want to change the Infracost VSCode extension, we recommend you use VSCode to build and develop the extension locally.

1. Clone the repo.
2. `yarn` install all the dependencies.
3. Open the repo in VSCode.
4. Install the [Terraform VSCode extension](https://marketplace.visualstudio.com/items?itemName=HashiCorp.terraform) in VSCode.
5. Inside the editor, press F5. VSCode will compile and run the extension in a new Development Host window.
6. Open a Terraform project, and navigate to a valid file. If all the previous steps have been followed correctly, you should see Infracost cost estimates above supported resource blocks.

Once you're finished with your work, open a PR, and we'll be happy to review it as soon as possible. 
