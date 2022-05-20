# Infracost VSCode Extension

Infracost's VSCode extension shows you cost estimates for Terraform right in your editor! Prevent costly infrastructure changes before they get into production.

## Features

Infracost's extension shows a snapshot of the total cost of resources right next to their Terraform definitions. Infracost's output updates on file save.

![](./.github/assets/resource-costs.gif)

Both `resource` and `module` blocks support showing cost estimates. Infracost's VSCode extension even supports showing prices on **3rd party module blocks**! 


![](./.github/assets/module-support.gif)

If a simple monthly cost isn't enough for you, just click the overview to show a detailed breakdown of what components affect the price.

![](./.github/assets/cost-webview.gif)

## Demo

Check out the video below to see the Infracost extension in action!

[![VSCode Infracost Demo]()](https://www.loom.com/share/b7cdf9052b604e5cb3bc5a90258a3db6)

## Requirements

The Infracost VSCode extension requires you have:

* VSCode version v1.67.0 or above.
* Infracost CLI version v0.10.0 or above [installed](https://www.infracost.io/docs) and registered with a valid API key.
* The [Terraform VSCode extension](https://marketplace.visualstudio.com/items?itemName=HashiCorp.terraform) installed and enabled in VSCode.

## Known Issues

* Infracost usage files are not yet supported
* Diff functionality is not yet supported

## Contributing

We love any contribution, big or small. If you want to change the Infracost VSCode extension, we recommend you use VSCode to build and develop the extension locally.

1. Clone the repo.
2. `yarn` install all the dependencies.
3. Open the repo in VSCode.
4. Install the [Terraform VSCode extension](https://marketplace.visualstudio.com/items?itemName=HashiCorp.terraform) in VSCode.
5. Inside the editor, press F5. VSCode will compile and run the extension in a new Development Host window.
6. Open a Terraform project, and navigate to a valid file. If all the previous steps have been followed correctly, you should see Infracost cost estimates above supported resource blocks.

Once you're finished with your work, open a PR, and we'll be happy to review it as soon as possible. 
