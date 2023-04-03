import { CONST, tx, sc, rpc, wallet, u } from "@cityofzion/neon-js";
import cors from "cors";
import crypto from "crypto";
import express from "express";
import session from "express-session";
import fs from "fs";
import https from "https";
import mysql from "mysql";

// Neo node
const rpcUrl = 'http://seed2.neo.org:20332';
const magic = CONST.MAGIC_NUMBER.TestNet;
const client = new rpc.RPCClient(rpcUrl);
const contract = '0xaf68ca6013bf69a148d5844342ebd9f7b01c9e9a';

// MySQL
const db = mysql.createPool({
    host: 'localhost',
    port: '3306',
    user: 'root',
    password: 'root',
    database: 'claimer'
})

// Servers
// const options = {
//     key: fs.readFileSync('./server.key'),
//     cert: fs.readFileSync('./server.crt')
// }
const app = express();
app.use(express.json());
app.use(cors());
app.use(session({
    secret: 'claimer',
    resave: true,
    rolling: true,
    saveUninitialized: false,
    cookie: {
        // secure: true,
        // domain: 'allweb.ngd.network'
        maxAge: 1000 * 60 * 10
    }
}));
// Authentication
app.use((req, res, next) => {
    if (req.path === '/' || req.path === '/register' || req.path === '/login') {
        next();
    } else if (!req.session.username || !req.session.account) {
        res.status(401).json({ 'result': false, 'error': 'Unauthorized' });
    } else {
        next();
    }
})
// Error handling
app.use((error, req, res, next) => {
    res.status(500).json({ 'result': false, 'error': error });
});

app.listen(8080, () => {
    console.log('Http server running at http://127.0.0.1:8080');
})
// https.createServer(options, app).listen(8443, () => {
//     console.log('Https server running at https://127.0.0.1:8443');
// });

// Routes
app.get('/', (_req, res) => {
    res.send('Claimer is working');
})

// User management
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const salt = genSalt();
    const passwordData = saltHashPassword(password, salt);

    // Create wallet
    const account = new wallet.Account();
    const newWallet = new wallet.Wallet({ name: 'claimer' });
    newWallet.addAccount(account);
    const result = await newWallet.encryptAll('');
    if (!result) {
        res.status(500).json({ 'result': false, 'error': 'Failed to encrypt wallet' });
    }
    const data = newWallet.export();
    fs.writeFileSync('./'+account.address+'.json', JSON.stringify(data));

    db.getConnection((err, conn) => {
        if (err) {
            fs.rmSync('./'+account.address+'.json');
            res.status(500).json({ 'result': false, 'error': err });
        }
        const sql = `INSERT INTO users (username, password, salt, account) VALUES ('${username}', '${passwordData}', '${salt}', '${account.address}')`;
        conn.query(sql, (err, _) => {
            if (err) {
                res.status(500).json({ 'result': false, 'error': err });
            } else {
                req.session.username = username;
                req.session.account = account.address;
                req.session.save();
                res.json({ 'result': true });
            }
        });
        conn.release();
    });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    const sql = `SELECT * FROM users WHERE username='${username}'`;
    db.getConnection((err, conn) => {
        if (err) {
            res.status(500).json({ 'result': false, 'error': err });
        }
        conn.query(sql, (err, result) => {
            if (err) {
                res.status(500).json({ 'result': false, 'error': err });
            } else {
                if (result.length === 0) {
                    res.status(401).json({ 'result': false, 'error': 'User not found' });
                } else {
                    if (result[0].password === saltHashPassword(password, result[0].salt)) {
                        req.session.username = username;
                        req.session.account = result[0].account;
                        req.session.save();
                        res.json({ 'result': true });
                    } else {
                        res.status(401).json({ 'result': false, 'error': 'Wrong password' });
                    }
                }
            }
        });
        conn.release();
    });
});

app.post('/claim', async (req, res) => {
    const address = req.session.account;

    const data = fs.readFileSync('./dispatcher.json', {encoding:'utf8', flag:'r'});
    const dispatcherWallet = new wallet.Wallet(JSON.parse(data));
    const account = await dispatcherWallet.accounts[0].decrypt('');

    // Mint NFT from dispatcher to claimer address
    const signer = {
        account: account.scriptHash,
        scopes: tx.WitnessScope.CalledByEntry
    }
    var sb = new sc.ScriptBuilder();
    sb.emitAppCall(contract, "mintToken", [sc.ContractParam.hash160(address), sc.ContractParam.string("hello")]);
    const script = sb.str;

    var mintTx = new tx.Transaction({script});
    mintTx.validUntilBlock = await client.getBlockCount() + 1;
    mintTx.addSigner(signer);
    mintTx.systemFee = await checkSystemFee(script, signer);
    mintTx.networkFee = await checkNetworkFee(mintTx);
    const signedTx = mintTx.sign(account, magic);

    const cRes = await client.sendRawTransaction(signedTx);
    res.json({ 'result': true, 'tx_id': cRes });
});

app.post('/balance', async (req, res) => {
    const address = req.session.account;

    // Query nfts of claimer
    var sb = new sc.ScriptBuilder();
    sb.emitAppCall(contract, "tokensOf", [sc.ContractParam.hash160(address)]);
    const response = await client.invokeScript(u.HexString.fromHex(sb.str));
    const iterator = response.stack[0].id;
    const session = response.session;

    const iRes = await client.execute(
        new rpc.Query({
            method: 'traverseiterator',
            params: [session, iterator, 100]
        })
    )

    res.json({ 'result': true, 'token_ids': iRes});
});

app.post('/transfer', async (req, res) => {
    const from = req.session.account;
    const to = req.body.address;
    const id = req.body.id;

    const data = fs.readFileSync('./'+from+'.json', {encoding:'utf8', flag:'r'});
    const claimerWallet = new wallet.Wallet(JSON.parse(data));
    const account = await claimerWallet.accounts[0].decrypt('');

    // Transfer nfts from claimer address to user address
    const signer = {
        account: account.scriptHash,
        scopes: tx.WitnessScope.CalledByEntry
    }
    var sb = new sc.ScriptBuilder();
    sb.emitAppCall(contract, "transfer", [sc.ContractParam.hash160(to), sc.ContractParam.byteArray(id), sc.ContractParam.byteArray("")]);
    const script = sb.str;

    var mintTx = new tx.Transaction({script});
    mintTx.validUntilBlock = await client.getBlockCount() + 1;
    mintTx.addSigner(signer);
    mintTx.systemFee = await checkSystemFee(script, signer);
    mintTx.networkFee = await checkNetworkFee(mintTx);
    const signedTx = mintTx.sign(account, magic);

    const tRes = await client.sendRawTransaction(signedTx);
    res.json({ 'result': true, 'tx_id': tRes });
});

const genSalt = () => {
    return crypto.randomBytes(16).toString("hex");
}

const saltHashPassword = (password, salt) => {
    var hash = crypto.createHmac('sha256', salt);
    hash.update(password);
    return hash.digest('hex');
}

const checkSystemFee = async (script, signer) => {
    const invokeFunctionResponse = await client.invokeScript(
        u.HexString.fromHex(script),
        [signer]
    );
    if (invokeFunctionResponse.state !== "HALT") {
        throw new Error(
            `Transfer script errored out: ${invokeFunctionResponse.exception}`
        );
    }
    return u.BigInteger.fromNumber(invokeFunctionResponse.gasconsumed);
}

const checkNetworkFee = async (tx) => {
    const feePerByteInvokeResponse = await client.invokeFunction(
        CONST.NATIVE_CONTRACT_HASH.PolicyContract,
        "getFeePerByte"
    );

    if (feePerByteInvokeResponse.state !== "HALT") {
        throw new Error("Unable to retrieve data to calculate network fee.");
    }
    const feePerByte = u.BigInteger.fromNumber(
        feePerByteInvokeResponse.stack[0].value
    );
    // Account for witness size
    const transactionByteSize = tx.serialize().length / 2 + 109;
    // Hardcoded. Running a witness is always the same cost for the basic account.
    const witnessProcessingFee = u.BigInteger.fromNumber(1000390);
    const networkFeeEstimate = feePerByte
        .mul(transactionByteSize)
        .add(witnessProcessingFee);
    return networkFeeEstimate;
}