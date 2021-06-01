# Node_Cli

The following repo contains a CLI interface to interact with contract and also guides on how you can create your very own KOI_Task.

## Install

1. `git clone https://github.com/open-koi/node_cli.git`
2. Setup `.env`
3. `yarn install`
4. `yarn start`

## Service setup

```sh
chmod a+x koi-node
sudo mkdir -p /var/lib/koi
sudo ln -sf /path/to/wallet.json /var/lib/koi/wallet.json
sudo ln -sf /home/user/Development/openkoi/node/koi-node /usr/local/bin/
sudo ln -sf /home/user/Development/openkoi/node/koi-node.service /etc/systemd/system/
sudo systemctl enable koi-node # Enables koi-node to auto start
```

Here are typical commands for a systemd service
```sh
sudo systemctl daemon-reload                              # reload configuration files
sudo systemctl start koi-node                             # start the service now
sudo systemctl stop koi-node                              # stop the service now (but don't wait for it finish stopping)
sudo systemctl status koi-node                            # show if the service is running and the last few log lines
sudo systemctl enable koi-node                            # start the service on boot
sudo systemctl disable koi-node                           # don't start the service on boot
sudo journalctl --unit=koi-node --since='-5 min' --follow # look at recent logs and await more
```
## TODO

- Setup KOI Tasks: If you select `Show KOI Tasks` to view the list of available tasks. Then you can enter the Id or name of any task which you want to run.The KOI associated with that task will get transferred to your wallet once the task is successfully completed and submitted to bundler(TODO: Need to combine this smart contract with original one).
