"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const node_ssh_1 = require("node-ssh");
const path_1 = __importDefault(require("path"));
const ssh2_streams_1 = require("ssh2-streams");
const fs_1 = __importDefault(require("fs"));
const { default: scandir, defaultFilesystem } = require('sb-scandir')
const PQ = require("sb-promise-queue");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const locker = core.getInput('locker');
        const privateKey = core.getInput('privateKey');
        const verbose = JSON.parse(core.getInput('verbose').toLowerCase());
        const recursive = JSON.parse(core.getInput('recursive').toLowerCase());
        const concurrency = +core.getInput('concurrency') || 1;
        const local = core.getInput('local');
        const dotfiles = JSON.parse(core.getInput('dotfiles').toLowerCase());
        const dotgit = JSON.parse(core.getInput('dotgit').toLowerCase());
        const remote = core.getInput('remote');
        const rmRemote = JSON.parse(core.getInput('rmRemote').toLowerCase());
        const kill = JSON.parse(core.getInput('kill').toLowerCase());
        try {
            const ssh = yield connect(locker, privateKey);
            yield scp(ssh, local, remote, dotfiles, dotgit, concurrency, verbose, recursive, rmRemote,kill);
            ssh.dispose();
        }
        catch (err) {
            core.setFailed(err);
        }
    });
}
function connect(locker, privateKey) {
    return __awaiter(this, void 0, void 0, function* () {
        const ssh = new node_ssh_1.NodeSSH();
        console.log(`Establishing a SSH connection to scripts.mit.edu.`);
        try {
            var seen = false;
            const config = {
                host: locker+'.scripts.mit.edu',
                port: 22,
                username: locker,
                tryKeyboard: false,
                onKeyboardInteractive: null,
                privateKey: privateKey,
                authHandler: function(authsLeft, partial, cb) {
                    if (seen) return false;
                    seen = true;
                    return 'publickey';
                }
            };
            yield ssh.connect(config);
            console.log(`🤝 Connected to ${locker}.scripts.mit.edu.`);
        }
        catch (err) {
            console.error(`⚠️ The GitHub Action couldn't connect to ${locker}.scripts.mit.edu.`, err);
            core.setFailed(err.message);
        }
        return ssh;
    });
}
function scp(ssh, local, remote, dotfiles, dotgit, concurrency, verbose = true, recursive = true, rmRemote = false, restart) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (isDirectory(local)) {
                if (rmRemote) {
                    yield cleanDirectory(ssh, remote);
                }
                yield putDirectory(ssh, local, remote, dotfiles, dotgit, concurrency, verbose, recursive);
            }
            else {
                yield ssh.putFile(local, remote, null, {mode:getUnixPerms(local)});
            }
            if (restart) {
                yield killServices(ssh, verbose);
            }
            ssh.dispose();
            console.log('✅ scp Action finished.');
        }
        catch (err) {
            console.error(`⚠️ An error happened:(.`, err.message, err.stack);
            ssh.dispose();
            process.abort();
        }
    });
}
function putDirectory(ssh, local, remote, dotfiles, dotgit, concurrency = 3, verbose = false, recursive = true) {
    return __awaiter(this, void 0, void 0, function* () {
        const status = yield subPutDirectory(ssh, local, remote, concurrency, recursive, dotfiles, dotgit, verbose)
        console.log(`The copy of directory ${local} was ${status ? 'successful' : 'unsuccessful'}.`);
        if (!status)
            throw "Bad copy";
    });
}
function cleanDirectory(ssh, remote, verbose = true) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // In spite of the clear need to use exec and escape this
            // exec for some reason fails?
            yield ssh.execCommand(`rm -rf ${remote}`);
            if (verbose) {
                console.log(`✔ Successfully deleted all files of ${remote}.`);
            }
        }
        catch (error) {
            console.error(`⚠️ A cleanup error happened:(.`, error.message, error.stack);
            ssh.dispose();
        }
    });
}

function killServices(ssh, verbose = true) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield ssh.execCommand('kill -9 -1');
            if (verbose) {
                console.log(`✔ Successfully killed existing processes.`);
            }
        }
        catch (error) {
            console.error(`⚠️ A kill error happened:(.`, error.message, error.stack);
            ssh.dispose();
        }
    });
}


async function subPutDirectory(
    ssh,
    localDirectory,
    remoteDirectory,
    concurrency,
    recursive,
    dotfiles,
    dotgit,
    verbose) {
    //invariant(typeof localDirectory === 'string' && localDirectory, 'localDirectory must be a string')
    //invariant(typeof remoteDirectory === 'string' && remoteDirectory, 'remoteDirectory must be a string')

    const localDirectoryStat = fs_1.default.statSync(localDirectory)

    //invariant(localDirectoryStat != null, `localDirectory does not exist at ${localDirectory}`)
    //invariant(localDirectoryStat.isDirectory(), `localDirectory is not a directory at ${localDirectory}`)

    const sftp = await ssh.requestSFTP()

    const scanned = await scandir(localDirectory, {
      recusive: recursive,
      validate: function (path) {
        const bn = path_1.default.basename(path)
        if (!dotfiles) return !bn.startsWith('.');
        if (!dotgit) return !path.startsWith('.git');
        return true;
      },
    })

    const files = scanned.files.map(item => path_1.default.relative(localDirectory, item))
    const directories = scanned.directories.map(item => path_1.default.relative(localDirectory, item))

    // Sort shortest to longest
    directories.sort((a, b) => a.length - b.length)

    let failed = false

    try {
      // Do the directories first.
        for (var i=0, len = directories.length; i < len; i++) {
            await ssh.mkdir(path_1.default.join(remoteDirectory, directories[i]), 'sftp', sftp)
        }


        for (var i=0, len = files.length; i < len; i++) {
            var file = files[i];
              const localFile = path_1.default.join(localDirectory, file)
              const remoteFile = path_1.default.join(remoteDirectory, file)
              try {
                await ssh.putFile(localFile, remoteFile, sftp, {mode:getUnixPerms(localFile)});
                if (verbose)
                    console.log(`✔ successfully copied ${localFile} to ${remoteFile}.`);
              } catch (e) {
                console.log(e)
                failed = true
                console.log(`❕copy failed for ${localFile} to ${remoteFile}.`);
              }
        }
    } catch( error ) {
        failed = true;
        console.log(error)
    } finally {
      sftp.end()
    }

    return !failed
  }

function getUnixPerms(local) {
    var stat = fs_1.default.statSync(local);
    return '0' + (stat.mode & parseInt('777', 8)).toString(8);
}

function isDirectory(path) {
    return fs_1.default.existsSync(path) && fs_1.default.lstatSync(path).isDirectory();
}

function putMany(array, asyncFunction) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const el of array) {
            yield asyncFunction(el);
        }
    });
}
run();
