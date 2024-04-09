
import { config } from "dotenv"
import * as bitcoin from "bitcoinjs-lib"
const tinysecp: TinySecp256k1Interface = require('tiny-secp256k1');
import { ECPairFactory, ECPairAPI, TinySecp256k1Interface, ECPairInterface } from 'ecpair';
import { retrieveTokens } from "./functions/Tokens";
import { createOffer, signData, submitSignedOfferOrder } from "./functions/Offer";

config()


const ECPair: ECPairAPI = ECPairFactory(tinysecp);
const PRIVATE_KEY = process.env.PRIVATE_KEY as string;
const TOKEN_RECEIVE_ADDRESS = process.env.TOKEN_RECEIVE_ADDRESS as string
const DEFAULT_OFFER_EXPIRATION = 10
const network = bitcoin.networks.bitcoin;
const FEE_RATE_TIER = 'halfHourFee'



async function main() {

  const bidCount = 100
  const duration = DEFAULT_OFFER_EXPIRATION
  const currentTime = new Date().getTime();
  const expiration = currentTime + (duration * 60 * 1000);
  const collectionSymbol = "the-prophecy"
  const buyerTokenReceiveAddress = TOKEN_RECEIVE_ADDRESS;
  const privateKey = PRIVATE_KEY;
  const keyPair = ECPair.fromWIF(privateKey, network);
  const publicKey = keyPair.publicKey.toString('hex');

  const privateKey2 = process.env.PRIVATE_KEY_2 as string
  const keyPair2 = ECPair.fromWIF(privateKey2, network);
  const publicKey2 = keyPair2.publicKey.toString('hex');


  const buyerPaymentAddress = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: network }).address as string

  const buyerPaymentAddress2 = bitcoin.payments.p2wpkh({ pubkey: keyPair2.publicKey, network: network }).address as string

  try {

    const tokenId = '6e7428d6b70e27497fab40e9c90d676826a12401b29a87bd688a5739097e92e3i0'
    const price = 25000
    const duration = 30
    const currentTime = new Date().getTime();
    const expiration = currentTime + (duration * 60 * 1000);
    const expiryB = expiration + (5 * 60 * 1000)

    const unsignedOffer = await createOffer(tokenId, price, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, FEE_RATE_TIER)

    const signedData = await signData(unsignedOffer, privateKey)

    console.log({ signedData });

    if (signedData) {
      const res = await submitSignedOfferOrder(signedData, tokenId, price, expiryB, buyerPaymentAddress, buyerTokenReceiveAddress, publicKey, FEE_RATE_TIER)
      console.log({ res });
    }

  } catch (error) {
    console.log(error);
  }
}

main().catch(error => console.log(error))


// generate , sign and submit psbt with expiry A


