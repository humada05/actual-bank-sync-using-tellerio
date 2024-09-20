import actualApi from '@actual-app/api';
import https from 'https';
import fs from 'fs';
import { Buffer } from 'buffer';
import fetch from 'node-fetch';

const TELLER_TOKEN = '<YOUR TELLER TOKEN>';
const CERT_PATH = `${process.env.HOME}/teller/certificate.pem`; // path to your teller.io certificate
const KEY_PATH = `${process.env.HOME}/teller/private_key.pem`; // path to your teller.io private key

const cert = fs.readFileSync(CERT_PATH);
const key = fs.readFileSync(KEY_PATH);

const agent = new https.Agent({
  cert: cert,
  key: key,
});

async function fetchTellerAccounts() {
  const response = await fetch('https://api.teller.io/accounts', {
    headers: {
      'Authorization': `Basic ${Buffer.from(TELLER_TOKEN + ':').toString('base64')}`,
    },
    agent: agent,
  });
  return response.json();
}

async function fetchTellerTransactions(accountId) {
  const response = await fetch(`https://api.teller.io/accounts/${accountId}/transactions`, {
    headers: {
      'Authorization': `Basic ${Buffer.from(TELLER_TOKEN + ':').toString('base64')}`,
    },
    agent: agent,
  });
  return response.json();
}

function convertAccount(tellerAccount) {
  return {
    id: tellerAccount.id,
    name: tellerAccount.name,
    type: tellerAccount.type.toLowerCase()
  };
}

function convertTransaction(tellerTransaction) {
  return {
    date: tellerTransaction.date,
    amount: actualApi.utils.amountToInteger(parseFloat(tellerTransaction.amount)),
    payee_name: tellerTransaction.details.counterparty?.name || tellerTransaction.description,
    notes: tellerTransaction.description,
    imported_id: tellerTransaction.id,
    cleared: tellerTransaction.status === 'posted',
  };
}

async function main() {
  await actualApi.init({
    dataDir: './data', // this can be any directory
    serverURL: 'http://localhost:5006', // replace with your specific URL
    password: 'demo',
  });
  
  await actualApi.downloadBudget('<YOUR SYNC ID>'); // This is needed for initialization of the API, not exactly sure why

  const tellerAccounts = await fetchTellerAccounts();
  const existingAccounts = await actualApi.getAccounts();

  for (let account of tellerAccounts) {
    const transactions = await fetchTellerTransactions(account.id);
    
    const accountExists = existingAccounts.some(existingAccount => existingAccount.name === account.name);

    let acctId;
    if (!accountExists) {
      let initialBalance = (transactions.at(-1).running_balance || 0) * 100;
      acctId = await actualApi.createAccount(convertAccount(account), initialBalance);
    } else {
      acctId = existingAccounts.find(existingAccount => existingAccount.name === account.name).id;
    }

    await actualApi.importTransactions(
      acctId,
      transactions.map(convertTransaction)
    );
  }

  await actualApi.shutdown();
}

main().catch(console.error);
