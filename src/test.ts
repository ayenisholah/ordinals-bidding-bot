
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
    const tokens = await retrieveTokens(collectionSymbol, bidCount)

    for (const token of tokens) {
      const price = token.listedPrice * 0.5
      const unsignedOffer = await createOffer(token.id, price, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, FEE_RATE_TIER)

      console.log({ unsignedOffer });

      const signedOfferData = signData(unsignedOffer, privateKey)

      console.log({ signedOfferData });


      if (signedOfferData) {
        await submitSignedOfferOrder(signedOfferData, token.id, price, expiration, buyerPaymentAddress2, buyerTokenReceiveAddress, publicKey2, FEE_RATE_TIER);
      }


    }

  } catch (error) {
    throw error
  }
}

main().catch(error => console.log(error))


// const psbt = bitcoin.Psbt.fromBase64(unsignedOffer.psbtBase64);

// psbt.data.outputs.forEach((output, index) => {
//   if (output.bip32Derivation && output.bip32Derivation.length > 0) {
//     const { pubkey, path } = output.bip32Derivation[0];
//     if (pubkey.toString('hex') === publicKey2) {
//       output.bip32Derivation[0].pubkey = Buffer.from(publicKey, 'hex');
//     }
//   }
// });
// psbt.data.outputs.forEach((output, index) => {
//   const targetScript = bitcoin.address.toOutputScript(buyerPaymentAddress2);
//   if (output.redeemScript && output.redeemScript.equals(targetScript)) {
//     const newOutputUpdate = {
//       redeemScript: bitcoin.address.toOutputScript(buyerPaymentAddress),
//     };
//     psbt.updateOutput(index, newOutputUpdate);
//   }
// });

// const modifiedUnsignedOffer = psbt.toBase64().toString()
// console.log(`Modified unsigned offer: ${modifiedUnsignedOffer}`);

// const newPsbt = bitcoin.Psbt.fromBase64(modifiedUnsignedOffer);