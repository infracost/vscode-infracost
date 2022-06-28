# Infracost VSCode Extension

Infracost's VSCode extension shows you cost estimates for Terraform right in your editor! Prevent costly infrastructure changes before they get into production.

## Features

Infracost's extension shows a snapshot of the total cost of resources right above their Terraform definitions. Infracost's output updates on file save.

![](https://github.com/infracost/vscode-infracost/blob/master/.github/assets/resource-costs.gif?raw=true)

Both `resource` and `module` blocks support showing cost estimates. Infracost's VSCode extension even supports showing prices on **3rd party module blocks**! 


![](https://github.com/infracost/vscode-infracost/blob/master/.github/assets/module-support.gif?raw=true)

If a simple monthly cost isn't enough for you, just click the overview to show a detailed breakdown of what components affect the price.

![](https://github.com/infracost/vscode-infracost/blob/master/.github/assets/cost-webview.gif?raw=true)

## Demo

Check out the video below to see the Infracost extension in action!

https://user-images.githubusercontent.com/6455139/169564807-320bbbf7-647f-4248-882f-2a6bbf9449b2.mp4

## Requirements

The Infracost VSCode extension requires you to have:

* VSCode **v1.67.0** or above.
* Infracost CLI version **v0.10.6** or above [installed](https://www.infracost.io/docs) and registered with a valid API key.
* The [Terraform VSCode extension](https://marketplace.visualstudio.com/items?itemName=HashiCorp.terraform) installed and enabled in VSCode.

## Known Issues

* Infracost [usage files](https://www.infracost.io/docs/features/usage_based_resources/) are not yet supported. This means that resources that solely use usage costs will have a `0.00` cost shown:
  
  ![](https://github.com/infracost/vscode-infracost/blob/master/.github/assets/zero-cost.png?raw=true)
* [Diff functionality](https://www.infracost.io/docs/features/cli_commands/#diff) is not yet supported.
* VSCode Infracost does not yet work with Infracost [config files](https://www.infracost.io/docs/features/config_file/). Multi project support is available using Infracost native auto-detection.
  This means that the first time running in a multi-project workspace might be quite slow.

## Contributing

We love any contribution, big or small. If you want to change the Infracost VSCode extension, we recommend you use VSCode to build and develop the extension locally.

1. Clone the repo.
2. `yarn` install all the dependencies.
3. Open the repo in VSCode.
4. Install the [Terraform VSCode extension](https://marketplace.visualstudio.com/items?itemName=HashiCorp.terraform) in VSCode.
5. Inside the editor, press F5. VSCode will compile and run the extension in a new Development Host window.
6. Open a Terraform project, and navigate to a valid file. If all the previous steps have been followed correctly, you should see Infracost cost estimates above supported resource blocks.

Once you're finished with your work, open a PR, and we'll be happy to review it as soon as possible. 
