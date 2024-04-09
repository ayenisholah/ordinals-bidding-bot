
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
      const modifiedPSBTBase64 = await modifyPublicKeyInPSBT(unsignedOffer.psbtBase64, buyerPaymentAddress2, publicKey2)


      console.log({ modifiedPSBTBase64 });


      const signedData = signData({ psbtBase64: modifiedPSBTBase64 }, privateKey2)

      console.log({ signedData });

      if (signedData)

        await submitSignedOfferOrder(signedData, token.id, price, expiration, buyerPaymentAddress2, buyerTokenReceiveAddress, publicKey2, FEE_RATE_TIER)


    }

  } catch (error) {
    throw error
  }
}

main().catch(error => console.log(error))

function findOutputIndex(psbt: any, address: any) {
  try {
    for (let i = 0; i < psbt.data.outputs.length; i++) {
      const output = psbt.data.outputs[i];
      const outputAddress = bitcoin.address.fromOutputScript(output.script, psbt.data.globalMap.unsignedTx.network);
      if (outputAddress === address) {
        return i;
      }
    }
    return -1; // Output not found
  } catch (error) {
    throw error;
  }
}

async function modifyPublicKeyInPSBT(psbtBase64: string, targetAddress: string, newPublicKeyHex: string) {
  // Decode base64 string to obtain PSBT object
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64);

  // Find the index of the output to modify
  const outputIndex = findOutputIndex(psbt, targetAddress);
  if (outputIndex === -1) {
    throw new Error("Output not found.");
  }

  // Update the public key at the specified index
  const output = psbt.data.outputs[outputIndex];
  if (output.bip32Derivation) {
    output.bip32Derivation[0].pubkey = Buffer.from(newPublicKeyHex, 'hex');
  } else {
    throw new Error("No bip32Derivation information found for the output.");
  }

  // Encode the modified PSBT object back to base64
  const modifiedPSBTBase64 = psbt.toBase64();

  return modifiedPSBTBase64;
}
