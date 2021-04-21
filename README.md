# Node_Cli

The following repo contains a CLI interface to interact with contract and also guides on how you can create your very own KOI_Task.

### Steps

1. git clone the repo
2. npm install
3. npm link
4. Run `koi-node`, Then you will be prompted with three options `Vote`, `Show KOI Tasks` and `Add KOI task`.

5. If you select `Vote`, then you will enter your walletLocation, stake amount and choose whether you want to vote direct(means without bundler you must have Ar to do direct vote) or indirect(means with bundler that is feeless),after you follow this step you will start to vote for the proposed logs.
6. If you select `Show KOI Tasks` to view the list of available tasks.Then you can enter the Id or name of any task which you want to run.The KOI associated with that task will get transfered to your wallet once the task is sucessfully completed and submitted to bundler(TODO: Need to combine this smart contract with original one).
