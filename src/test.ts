
import { config } from "dotenv"
import * as bitcoin from "bitcoinjs-lib"
const tinysecp: TinySecp256k1Interface = require('tiny-secp256k1');
import { ECPairFactory, ECPairAPI, TinySecp256k1Interface } from 'ecpair';
import { getToken, retrieveTokens } from "./functions/Tokens";
import { createOffer, signData, submitSignedOfferOrder } from "./functions/Offer";
import { error } from "console";

config()


const ECPair: ECPairAPI = ECPairFactory(tinysecp);
const PRIVATE_KEY = process.env.PRIVATE_KEY as string;
const TOKEN_RECEIVE_ADDRESS = process.env.TOKEN_RECEIVE_ADDRESS as string
const DEFAULT_OFFER_EXPIRATION = 10
const network = bitcoin.networks.bitcoin;
const FEE_RATE_TIER = 'halfHourFee'



async function main() {
  const item = {
    collectionSymbol: "rune_gods",
    minBid: 0.00012,
    maxBid: 0.00018,
    bidCount: 40,
    duration: 10,
    counterbidLoop: 10,
    outBidMargin: 0.00001,
    receiverWallet: "bc1p5rw87me62aftc3lgrqpq430gp3rp5wtj4atxz6pum2rmhjhvsk0sx73cgk"
  }
  const bidCount = item?.bidCount ?? 40
  const duration = item?.duration ?? DEFAULT_OFFER_EXPIRATION
  const currentTime = new Date().getTime();
  const expiration = currentTime + (duration * 60 * 1000);
  const collectionSymbol = item.collectionSymbol
  const buyerTokenReceiveAddress = item.receiverWallet ?? TOKEN_RECEIVE_ADDRESS;
  const privateKey = PRIVATE_KEY;
  const keyPair = ECPair.fromWIF(privateKey, network);
  const publicKey = keyPair.publicKey.toString('hex');

  const buyerPaymentAddress = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: network }).address as string

  try {
    const tokens = await retrieveTokens(collectionSymbol, bidCount)

    for (let i = 0; i < tokens.length; i++) {
      const tokenId = tokens[i].id
      const offerPrice = tokens[i].listedPrice * 0.5
      if (i === 19) {
        const Token20 = tokens[19].id
        const Token21 = tokens[20].id

        const price20 = tokens[19].listedPrice * 0.5
        const price21 = tokens[20].listedPrice * 0.5


        const [unsignedOffer20, unsignedOffer21] = await Promise.all([
          createOffer(Token20, price20, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, FEE_RATE_TIER),
          createOffer(Token21, price21, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, FEE_RATE_TIER)
        ])

        console.log({ unsignedOffer20, unsignedOffer21 });

        const signedOffer20 = signData(unsignedOffer20, privateKey)
        const signedOffer21 = signData(unsignedOffer21, privateKey)

        console.log({ signedOffer20, signedOffer21 });

        if (signedOffer20 && signedOffer21) {
          await Promise.all([
            submitSignedOfferOrder(signedOffer20, Token20, price20, expiration, buyerPaymentAddress, buyerTokenReceiveAddress, publicKey, FEE_RATE_TIER),
            submitSignedOfferOrder(signedOffer21, Token21, price21, expiration, buyerPaymentAddress, buyerTokenReceiveAddress, publicKey, FEE_RATE_TIER)
          ])
        }
      }


      await placeBid(tokenId, offerPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, privateKey, collectionSymbol)
    }

  } catch (error) {
    throw error
  }
}

main().catch(error => console.log(error))

export async function placeBid(
  tokenId: string,
  offerPrice: number,
  expiration: number,
  buyerTokenReceiveAddress: string,
  buyerPaymentAddress: string,
  publicKey: string,
  privateKey: string,
  collectionSymbol: string
) {
  try {
    const token = await getToken(tokenId)
    if (token?.listed) {
      const price = Math.round(offerPrice)
      const unsignedOffer = await createOffer(tokenId, price, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, FEE_RATE_TIER)
      const signedOffer = await signData(unsignedOffer, privateKey)
      if (signedOffer) {

        await submitSignedOfferOrder(signedOffer, tokenId, offerPrice, expiration, buyerPaymentAddress, buyerTokenReceiveAddress, publicKey, FEE_RATE_TIER)

        console.log({
          collectionSymbol,
          tokenId,
          price,
          buyerTokenReceiveAddress,
          buyerPaymentAddress,
          bid: true,
        });
      }
    }

  } catch (error) {
    console.log(error);
  }
}
