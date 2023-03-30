import { rpc } from "@cityofzion/neon-js";
import cors from "cors";
import crypto from "crypto";
import express from "express";
import session from "express-session";
import fs from "fs";
import https from "https";
import mysql from "mysql";

// Neo node
const rpcUrl = 'http://seed2.neo.org:20332';
const client = new rpc.RPCClient(rpcUrl);
const contract = '0x4a5da9be264719031f74bd061fec83f9c6c4cc4f';

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
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    const salt = genSalt();
    const passwordData = saltHashPassword(password, salt);

    // Create account
    // ......

    db.getConnection((err, conn) => {
        if (err) {
            res.status(500).json({ 'result': false, 'error': err });
        }
        const sql = `INSERT INTO users (username, password, salt) VALUES ('${username}', '${passwordData}', '${salt}')`;
        conn.query(sql, (err, _) => {
            if (err) {
                res.status(500).json({ 'result': false, 'error': err });
            } else {
                req.session.username = username;
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
                    const salt = result[0].salt;
                    if (result[0].password === saltHashPassword(password, salt)) {
                        req.session.username = username;
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

app.post('/claim', (req, res) => {

});

app.post('/balance', (req, res) => {
    
});

app.post('/transfer', (req, res) => {
        
});

const genSalt = () => {
    return crypto.randomBytes(16).toString("hex");
}

const saltHashPassword = (password, salt) => {
    var hash = crypto.createHmac('sha256', salt);
    hash.update(password);
    return hash.digest('hex');
}
