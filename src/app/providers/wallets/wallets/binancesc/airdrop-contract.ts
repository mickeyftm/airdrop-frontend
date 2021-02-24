import {ETHEREUM_AIRDROP_ABI, ETHEREUM_AIRDROP_ADDRESSES} from '../../constants/contracts/ethereum-airdrop';
import {AbstractContract} from './abstract-contract';
import BigNumber from 'bignumber.js';

export class AirdropContract extends AbstractContract {
  constructor(
    binanceChain
  ) {
    const airdropAddress = ETHEREUM_AIRDROP_ADDRESSES[+binanceChain.chainId];
    super(binanceChain, ETHEREUM_AIRDROP_ABI, airdropAddress);
  }


  public async getFee(): Promise<any> {
    const walletAddress = (await this.binanceChain.request({ method: 'eth_requestAccounts' }))[0];
    return this.callMethod(walletAddress, 'fee', []);
  }

  private async gasLimit(): Promise<any> {
    return (await this.getBlock()).gasLimit;
  }

  public async tokensMultiSendGas(testTokenAddress): Promise<any> {
    const addressesLengthTest = 500;

    const walletAddress = (await this.binanceChain.request({ method: 'eth_requestAccounts' }))[0];
    const fee = await this.getFee();
    const blockGasLimit = +(await this.gasLimit());

    const accounts = Array(addressesLengthTest).fill(null);
    const promises = [];

    accounts.forEach((address, index) => {
      if ((index !== 0) && (index !== (addressesLengthTest - 1))) {
        return;
      }
      const addressesArray = Array(index + 1);
      addressesArray.fill(this.web3.eth.accounts);

      const addresses = addressesArray.map((creator) => {
        const account = creator.create();
        return account.address;
      });
      const amountsArray = Array(addresses.length);
      amountsArray.fill('1');
      const data = this.decodeMethod('multisendToken', [
        testTokenAddress,
        addresses,
        amountsArray,
        amountsArray.length.toString(10)
        ]
      );

      promises.push(
        this.estimateGas([{
          from: walletAddress,
          to: this.contractAddress,
          value: fee,
          data
        }]).then((res) => {
          return {
            gasLimit: +res,
            data
          };
        }, (err) => {
          console.log(err);
        })
      );
    });

    return new Promise((resolve, reject) => {
      Promise.all(promises).then((result) => {
        if (!result[0] || !result[1]) {
          return reject();
        }
        const gasLimit1 = result[0].gasLimit;
        const gasLimit2 = result[1].gasLimit;

        const oneAddressDataLength = result[0].data.length;
        const moreAddressesDataLength = result[1].data.length;


        const oneAddressAdding = Math.ceil((gasLimit2 - gasLimit1) / addressesLengthTest);
        const initTransaction = gasLimit1 - oneAddressAdding;
        const maxAddressesLength = Math.floor((blockGasLimit - initTransaction) / oneAddressAdding / 100) * 100;

        console.log('Latest block gas limit:', blockGasLimit);
        console.log('Gas limit per address:', oneAddressAdding);
        console.log('Gas limit of first address:', initTransaction);
        console.log('Max addresses length per tx:', maxAddressesLength);

        resolve({
          maxAddressesLength,
          gasLimitPerAddress: oneAddressAdding,
          gasLimitForFirstAddress: gasLimit1
        });
      }, () => {
        reject();
      });
    });

  }

  private async sendTokensToAddresses(token, addresses, gasLimit, gasPrice): Promise<any> {
    const fee = await this.getFee();
    let fullAmount = new BigNumber(0);

    const walletAddress = (await this.binanceChain.request({ method: 'eth_requestAccounts' }))[0];

    const txParams = addresses.reduce((data, item) => {
      const itemAmount = new BigNumber(item.amount).times(Math.pow(10, token.decimals));
      fullAmount = fullAmount.plus(itemAmount);
      data.addresses.push(item.address.toLowerCase());
      data.amounts.push(itemAmount.toString(10));
      return data;
    }, {addresses: [], amounts: []});

    let hashFunc;
    const oncePromise = new Promise((resolve) => {
      hashFunc = resolve;
    });

    const tx = this.sendMethod(walletAddress, 'multisendToken',
      [
        token.address,
        txParams.addresses,
        txParams.amounts,
        fullAmount.toString(10)
      ], fee, '0x' + Number(gasPrice).toString(16), undefined, hashFunc
    );

    return {
      checker: tx,
      hash: oncePromise
    };
  }
}
