import { config } from "dotenv"

config()
import { collectionActivity } from "./functions/Collection";
import { IOffer, getOffers, retrieveCancelOfferFormat, signData, submitCancelOfferData } from "./functions/Offer";

async function main() {
  try {
    const buyerTokenReceiveAddress = 'bc1p5rw87me62aftc3lgrqpq430gp3rp5wtj4atxz6pum2rmhjhvsk0sx73cgk'
    const tokenId = '68c2b80824383b5f361ee49207bc56ff8af78612b6994c09bd0c0737fcd164f4i1441'
    const offerData = await getOffers(tokenId, buyerTokenReceiveAddress)

    console.log({ offerData });


  } catch (error) {
    console.log(error);
  }
}


main().catch(error => console.log(error))


async function cancelBid(offer: IOffer, privateKey: string, collectionSymbol: string, tokenId: string, buyerPaymentAddress: string) {
  try {
    const offerFormat = await retrieveCancelOfferFormat(offer.id)
    if (offerFormat) {
      const signedOfferFormat = signData(offerFormat, privateKey)
      if (signedOfferFormat) {
        await submitCancelOfferData(offer.id, signedOfferFormat)
        console.log('--------------------------------------------------------------------------------');
        console.log(`CANCELLED OFFER FOR ${collectionSymbol} ${tokenId}`);
        console.log('--------------------------------------------------------------------------------');
      }
    }
  } catch (error) {
    console.log(error);
  }
}
