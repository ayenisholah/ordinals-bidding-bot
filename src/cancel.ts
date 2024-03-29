import fs from "fs"
import { getOffers, getUserOffers } from "./functions/Offer"

async function main() {
  const buyerTokenReceiveAddress = 'bc1p5rw87me62aftc3lgrqpq430gp3rp5wtj4atxz6pum2rmhjhvsk0sx73cgk'

  try {
    const data = await getUserOffers(buyerTokenReceiveAddress)
    console.log({ data: data?.total });

  } catch (error) {
    console.log(error);

  }
}


main().catch(error => console.log(error))