const axios = require("axios");
const Bottleneck = require("bottleneck");
const fs = require("fs");
const PQueue = require("p-queue");

// Read the JSON file
const jsonData = JSON.parse(fs.readFileSync("bidding_config.json", "utf-8"));

// Initialize the rate limiter
const limiter = new Bottleneck({
	minTime: 250, // 4 requests per second
});

// Store the last seen activity timestamp and top listings for each collection
const collectionData = {};

// Function to get the latest offers and listings for a collection
async function getCollectionActivity(collectionSymbol, offset = 0) {
	const url = "https://nfttools.pro/magiceden/v2/ord/btc/activities";
	const params = {
		limit: 100,
		offset,
		collectionSymbol,
		kind: ["list", "offer_placed"],
	};

	try {
		const response = await limiter.schedule({ priority: 5 }, () =>
			axios.get(url, { params })
		); //activity request is lower priority
		return response.data;
	} catch (error) {
		console.error("Error fetching collection activity:", error);
		return [];
	}
}

// Function to get the listed tokens for a collection
async function getListedTokens(collectionSymbol) {
	const url = "https://api.example.com/listed-tokens";
	const params = {
		collectionSymbol,
	};

	try {
		const response = await limiter.schedule(() => axios.get(url, { params }));
		return response.data;
	} catch (error) {
		console.error("Error fetching listed tokens:", error);
		return [];
	}
}

// Function to get the best offer for a token
async function getBestOffer(tokenId) {
	const url = `https://api.example.com/best-offer/${tokenId}`;

	try {
		const response = await limiter.schedule(() => axios.get(url));
		return response.data;
	} catch (error) {
		console.error(`Error fetching best offer for token ${tokenId}:`, error);
		return null;
	}
}

// Function to cancel offer for a token
async function cancelBid(tokenId) {
	const url = `https://api.example.com/cancel/${tokenId}`;

	try {
		const response = await limiter.schedule(() => axios.get(url));
		return response.data;
	} catch (error) {
		console.error(`Error cancelling offer for token ${tokenId}:`, error);
		return null;
	}
}

// Function to place a bid on a token
async function placeBid(tokenId, price) {
	// Implement the logic to place a bid on a token using the appropriate API
	console.log(`Placing bid on token ${tokenId} for ${price} BTC`);
}

// Function to process the scheduled check for a collection
async function processScheduledLoop(item) {
	const { collectionSymbol, bidCount, minBid, maxBid, scheduledLoop } = item;

	// Get the listed tokens for the collection
	const listedTokens = await getListedTokens(collectionSymbol);

	// Store the top bidCount listings
	const topListings = listedTokens.slice(0, bidCount);
	collectionData[collectionSymbol].topListings = topListings;

	// Create a queue with concurrency based on the rate limit
	const queue = new PQueue({
		concurrency: Math.floor(limiter.reservoir.intervalCap * 1.1),
	});

	// Process each token in the top listings using the queue
	await queue.addAll(
		topListings.map((token) => async () => {
			const { tokenId, price: listedPrice } = token;

			// Get the best offer for the token
			const bestOffer = await getBestOffer(tokenId);

			// Check if we have an existing offer on the token
			const ourExistingOffer =
				collectionData[collectionSymbol].ourBids[tokenId];

			if (bestOffer) {
				const { price: bestPrice, isOurs } = bestOffer;

				if (!isOurs && bestPrice >= minBid && bestPrice <= maxBid) {
					// Cancel our existing offer if we have one
					if (ourExistingOffer) {
						await cancelBid(tokenId);
					}

					// Check if we have reached the bidCount limit
					const currentBidCount = Object.values(
						collectionData[collectionSymbol].topBids
					).filter(Boolean).length;
					if (currentBidCount < bidCount) {
						// Outbid the current best offer with a margin up to maxBid
						const bidPrice = Math.min(bestPrice + 0.00001, maxBid);
						await placeBid(tokenId, bidPrice);

						// Record our bid
						collectionData[collectionSymbol].ourBids[tokenId] = bidPrice;
						collectionData[collectionSymbol].topBids[tokenId] = true;
					}
				}
			} else {
				// No existing bid, place a new bid if we haven't reached the bidCount limit
				const currentBidCount = Object.values(
					collectionData[collectionSymbol].topBids
				).filter(Boolean).length;
				if (currentBidCount < bidCount) {
					// Cancel our existing offer if we have one
					if (ourExistingOffer) {
						await cancelBid(tokenId);
					}

					const bidPrice = Math.max(minBid, listedPrice * 0.5);
					await placeBid(tokenId, bidPrice);

					// Record our bid
					collectionData[collectionSymbol].ourBids[tokenId] = bidPrice;
					collectionData[collectionSymbol].topBids[tokenId] = true;
				}
			}
		})
	);

	// Schedule the next check
	setTimeout(() => processScheduledLoop(item), scheduledLoop * 1000);
}

// Function to process the bidding logic for a collection
async function processCounterBidLoop(item) {
	const { collectionSymbol, bidCount, minBid, maxBid, counterbidLoop } = item;

	// Initialize collection data if it doesn't exist
	if (!collectionData[collectionSymbol]) {
		collectionData[collectionSymbol] = {
			lastSeenActivity: null,
			topListings: [],
			topBids: {},
		};
	}

	// Get the latest activities for the collection
	const activities = await getCollectionActivity(collectionSymbol);

	// Update the last seen activity timestamp
	if (activities.length > 0) {
		collectionData[collectionSymbol].lastSeenActivity = activities[0].timestamp;
	}

	// Process offers and listings
	const offers = activities.filter(
		(activity) => activity.kind === "offer_placed"
	);
	const listings = activities.filter((activity) => activity.kind === "list");

	// Check and outbid higher offers within the min/max range
	const uniqueOffers = offers.reduce((acc, offer) => {
		const existingOffer = acc.find((o) => o.tokenId === offer.tokenId);
		if (!existingOffer || offer.price > existingOffer.price) {
			acc = acc.filter((o) => o.tokenId !== offer.tokenId);
			acc.push(offer);
		}
		return acc;
	}, []);

	for (const offer of uniqueOffers) {
		const { tokenId, price: offerPrice } = offer;

		// Check if we are bidding on this token
		if (collectionData[collectionSymbol].topBids[tokenId]) {
			// Check if the offer price is within the min/max range
			if (offerPrice >= minBid && offerPrice <= maxBid) {
				// Cancel our existing offer
				await cancelBid(tokenId);

				// Place a new bid with a small increment
				const bidPrice = offerPrice + 0.00001;
				await placeBid(tokenId, bidPrice);

				// Update the top bids record
				collectionData[collectionSymbol].topBids[tokenId] = true;
			}
		}
	}

	// Check new listings within the bidding count range
	const uniqueListings = listings.reduce((acc, listing) => {
		if (!acc.some((l) => l.tokenId === listing.tokenId)) {
			acc.push(listing);
		}
		return acc;
	}, []);

	// Sort the unique listings by price in ascending order
	uniqueListings.sort((a, b) => a.price - b.price);

	// Get the bottom bidCount listings
	const bottomListings = uniqueListings.slice(0, bidCount);

	// Compare the current bottom listings with the stored top listings
	const newBottomListings = bottomListings.filter(
		(listing) =>
			!collectionData[collectionSymbol].topListings.some(
				(l) => l.tokenId === listing.tokenId
			)
	);

	if (newBottomListings.length > 0) {
		// Cancel offers on tokens with higher listing prices
		const tokensToCancel = collectionData[collectionSymbol].topListings
			.filter(
				(listing) => !bottomListings.some((l) => l.tokenId === listing.tokenId)
			)
			.map((listing) => listing.tokenId);

		for (const tokenId of tokensToCancel) {
			await cancelBid(tokenId);
			delete collectionData[collectionSymbol].topBids[tokenId];
		}

		// Place bids on the new bottom listings
		for (const listing of newBottomListings) {
			if (listing.price >= minBid && listing.price <= maxBid) {
				await placeBid(listing.tokenId, listing.price);
				collectionData[collectionSymbol].topBids[listing.tokenId] = true;
			}
		}

		// Update the stored top listings
		collectionData[collectionSymbol].topListings = bottomListings;
	}

	// Schedule the next bidding iteration
	setTimeout(() => processBidding(item), counterbidLoop * 1000);
}

// Start the bidding process and scheduled check for each collection
jsonData.forEach((item) => {
	processCounterBidLoop(item);
	processScheduledLoop(item);
});
