# Sumamry
This is a faucet API server which receive faucet requests from the front-end, validate them and inject transfer transaction to the request user account

# Description

- Expose a POST endpoint /faucet with request body {"nodeAddress", "username", "userAddress", "sign": {"owner", "sig"}}
- there will be 2 modules. 1) Faucet 2)Blockchain 3)Stats. Faucet will handle api parts. Blockchain will handle transaction part. Stats will store faucet request and tx hash.
- In the blockchain module, tx injection code will be like this:

```
const crypto = require('@shardus/crypto-utils')
const stringify = require('fast-stable-stringify')
const axios = require('axios')
const { ethers } = require('ethers')
const { Utils } = require('@shardus/types')
require('dotenv').config()

crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')
crypto.setCustomStringifier(Utils.safeStringify, 'shardus_safeStringify')

  const to = await getAddress(answers.target)
  const amountInWei = libToWei(parseFloat(answers.amount))
  console.log(`Sending ${amountInWei} to ${to}`)
  const tx = {
    type: 'transfer',
    from: USER.address,
    to,
    amount: amountInWei,
    chatId: calculateChatId(to, USER.address),
    memo: answers.memo ? answers.memo : null,
    timestamp: Date.now(),
    //test: false
  }
  signTransaction(tx)
  injectTx(tx).then((res) => {
    this.log(res)
    callback()
  })

  async function getAddress(handle) {
  if (handle.length === 64) return handle
  try {
    const res = await axios.get(`${PROTOCOL}://${HOST}/address/${crypto.hash(handle)}`)
    const { address, error } = res.data
    if (error) {
      console.log(error)
    } else {
      return address
    }
  } catch (error) {
    console.log(error)
  }
}

function libToWei(lib) {
  return BigInt(lib * 10 ** 18)
}
function calculateChatId(to, from) {
  return crypto.hash([from, to].sort((a, b) => a.localeCompare(b)).join(''))
}
function signEthereumTx(tx, keys) {
  if (!keys) {
    throw new Error('Keys are required for signing')
  }

  tx.networkId = networkId
  // Create a copy of the tx without any existing sign field
  const dataToSign = Object.assign({}, tx)
  delete dataToSign.sign

  // Convert the object to a string with BigInt support
  const message = crypto.hashObj(dataToSign)

  try {
    // Create wallet from private key
    const wallet = new ethers.Wallet(keys.secretKey)

    // Sign the message
    const signature = wallet.signMessageSync(message)

    // Add signature to transaction
    tx.sign = {
      owner: toShardusAddress(wallet.address),
      sig: signature,
    }
  } catch (error) {
    throw new Error(`Failed to sign transaction: ${error.message}`)
  }
}
async function injectTx(tx) {
  const data = Utils.safeStringify(tx)
  console.log('Tx data', data)
  try {
    const res = await axios.post(`${PROTOCOL}://${HOST}/inject`, { tx: data })
    return res.data
  } catch (err) {
    console.log('Error injecting tx:', err.message)
    return err.message
  }
}
```