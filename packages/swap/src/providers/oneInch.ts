import type Web3Eth from "web3-eth";
import { numberToHex, toBN } from "web3-utils";
import { NetworkNames } from "@enkryptcom/types";
import {
  EVMTransaction,
  getQuoteOptions,
  ProviderName,
  ProviderQuoteResponce,
  QuoteMetaOptions,
  TokenType,
} from "../types";
import { FEE_CONFIGS, GAS_LIMITS, NATIVE_TOKEN_ADDRESS } from "../configs";
import { OneInchResponseType } from "./types";
import { getAllowanceTransactions } from "../utils/approvals";

const supportedNetworks: {
  [key in NetworkNames]?: { approvalAddress: string; chainId: string };
} = {
  [NetworkNames.Ethereum]: {
    approvalAddress: "0x1111111254eeb25477b68fb85ed929f73a960582",
    chainId: "1",
  },
  [NetworkNames.Binance]: {
    approvalAddress: "0x1111111254eeb25477b68fb85ed929f73a960582",
    chainId: "56",
  },
  [NetworkNames.Matic]: {
    approvalAddress: "0x1111111254eeb25477b68fb85ed929f73a960582",
    chainId: "137",
  },
  [NetworkNames.Optimism]: {
    approvalAddress: "0x1111111254eeb25477b68fb85ed929f73a960582",
    chainId: "10",
  },
};

const BASE_URL = "https://api.1inch.io/v5.0/";

class OneInch {
  tokenList: TokenType[];

  network: NetworkNames;

  web3eth: Web3Eth;

  name: ProviderName;

  constructor(web3eth: Web3Eth, network: NetworkNames, tokenList: TokenType[]) {
    this.network = network;
    this.tokenList = tokenList;
    this.web3eth = web3eth;
    this.name = ProviderName.oneInch;
  }

  static isSupported(network: NetworkNames) {
    return Object.keys(supportedNetworks).includes(network);
  }

  getQuote(
    options: getQuoteOptions,
    meta: QuoteMetaOptions
  ): Promise<ProviderQuoteResponce | null> {
    if (
      !OneInch.isSupported(options.toNetwork as NetworkNames) ||
      !OneInch.isSupported(options.fromNetwork)
    )
      Promise.resolve(null);
    const feeConfig = FEE_CONFIGS[this.name][meta.walletIdentifier];
    const params = new URLSearchParams({
      fromTokenAddress: options.fromToken.address,
      toTokenAddress: options.toToken.address,
      amount: options.amount.toString(),
      fromAddress: options.fromAddress,
      slippage: meta.slippage ? meta.slippage : "0.5",
      fee: feeConfig ? (feeConfig.fee * 100).toFixed(3) : "0",
      referrerAddress: feeConfig ? feeConfig.referrer : "",
      disableEstimate: "true",
    });
    return fetch(
      `${BASE_URL}${
        supportedNetworks[options.fromNetwork].chainId
      }/swap?${params.toString()}`
    )
      .then((res) => res.json())
      .then(async (response: OneInchResponseType) => {
        if (response.error) {
          console.error(response.error, response.description);
          return Promise.resolve(null);
        }
        const transactions: EVMTransaction[] = [];

        if (options.fromToken.address !== NATIVE_TOKEN_ADDRESS) {
          const approvalTxs = await getAllowanceTransactions({
            infinityApproval: meta.infiniteApproval,
            spender: supportedNetworks[options.fromNetwork].approvalAddress,
            web3eth: this.web3eth,
            amount: options.amount,
            fromAddress: options.fromAddress,
            fromToken: options.fromToken,
          });
          transactions.push(...approvalTxs);
        }
        transactions.push({
          gasLimit: GAS_LIMITS.swap,
          to: response.tx.to,
          value: numberToHex(response.tx.value),
          data: response.tx.data,
        });
        return {
          transactions,
          toTokenAmount: toBN(response.toTokenAmount),
          fromTokenAmount: toBN(response.fromTokenAmount),
        };
      });
  }
}

export default OneInch;
