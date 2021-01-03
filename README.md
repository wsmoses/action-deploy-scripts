# Deploy to MIT Scripts github action

## ✨ Example Usage

**Checkout this repository and deploy it to scripts whenever main is updated

```yml
on:
  push:
    branches:
      - main

jobs:
  scripts-job:
    runs-on: ubuntu-latest
    name: test MIT scripts action
    steps:
    - name: Checkout
      uses: actions/checkout@v2
    - name: Deploy
      uses: wsmoses/action-deploy-scripts@main
      with:
        locker: 'wmoses'
        remote: programming-jackbox
        privateKey: ${{ secrets.PRIVATE_KEY }}


```

Check out [the workflow example](https://github.com/wsmoses/programming-jackbox/blob/main/.github/workflows/main.yml) for a minimalistic yaml workflow in GitHub Actions.

## Setup

You'll need to both ensure that scripts.daemon can write into the folder you want to copy to (enabling this action to copy to said folder).

To do so, perform the following on Athena (`ssh username@athena.dialup.mit.edu`):
```bash
# No need to add locker if working on your personal (username) locker
$ cd /mit/locker
$ fs sa web_scripts daemon.scripts lrw
```

### SSH Private Key

You'll also have to create an ssh token that can be used by this action to deploy

The token can be created by running the following (make sure to give it a name to avoid overwriting any existing key):
```bash
$ ssh-keygen -t rsa
Generating public/private rsa key pair.
Enter file in which to save the key (/Users/wmoses/.ssh/id_rsa): tmprsa
Enter passphrase (empty for no passphrase):
Enter same passphrase again:
Your identification has been saved in tmprsa.
Your public key has been saved in tmprsa.pub.
```

🔐 Copy the results of tmprsa (not tmprsa.pub) as PRIVATE_KEY (or whatever secret name you use from your workflow), here: `https://github.com/USERNAME/REPO/settings/secrets`.

### SSH Public key
We now need to add the public key we just generated to the authorized_users of our scripts locker. For security reasons, this is going to be a bit more difficult than usual.

We need to ensure the `authorized_keys` file is readable by `system:anyuser` in AFS (mode 600). However, as AFS only supports permissions on directories, not files -- we will need to do some extra work to ensure we don't have to mark our entire .ssh directory as readable by any user.

```bash
# No need to add locker if working on your personal (username) locker
$ cd /mit/locker
# Enter .ssh (creating it if necessary)
$ mkdir -p .ssh && cd .ssh
# Create an "authorized" directory which is world-readable
$ mkdir authorized && cd authorized
$ chmod 700 .
$ fs sa . system:anyuser lr
# Create an authorized_keys file, if it doesn't exist
$ touch ../authorized_keys
# Move the existing authorized file, if it exists
$ mv ../authorized_keys .
# Set permissions on the authorized key file
$ chmod 600 authorized_keys
# Symlink the normal location for authorized_keys to its new location
$ ln -s ../authorized_keys authorized_keys
# append the new public key to the list of authorized keys
$ /path/to/tmprsa.pub >> authorized_keys
```

### Final setup

Now that we've added the public key to authorized_keys and the private key as a github secret, it is advisable to now erase the private and public key on dist.

DO NOT ADD YOUR PUBLIC KEY DIRECTLY AS `privateKey` without going through a repository secret. This will expose the key to the world and let anyone on the internet ssh to your locker.

## Options

- **locker** - _string_ - Locker being copied into **Required**

- **privateKey** - _mixed_ - _Buffer_ or _string_ that contains a private key for either key-based or hostbased user authentication (OpenSSH format). This key must also have its corresponding public key inside of locker/.ssh/authorized_keys (with system:anyuser able to read it). **Required**

- **local** - _string_ - Path to local folder you want to copy. **Default:** `.`

- **remote** - _string_ - Path relative to web_scripts to copy the contents to. **Default:** `.`

- **recursive** - _boolean_ - Copy directory contents recursively. **Default:** `true`

- **verbose** - _boolean_ - Output every single file transfer status. **Default:** `true`

- **dotfiles** - _boolean_ - Include files with a leading `.` e.g. `.htaccess` **Default:** `false`

- **dotgit** - _boolean_ - Include files with a leading `.git` e.g. `.git/FETCH_HEAD` **Default:** `false`

- **rmRemote** - _boolean_ - Clean directory before uploading. **Default:** `false`

- **kill** - _boolean_ - Kill existing scripts processes (which may be running old code). **Default:** `true`

This action is based off of [github-action-scp](https://github.com/garygrossgarten/github-action-scp).
