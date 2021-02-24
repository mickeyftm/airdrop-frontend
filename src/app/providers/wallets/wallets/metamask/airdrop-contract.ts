import {ETHEREUM_AIRDROP_ABI} from '../../constants/contracts/ethereum-airdrop';

import {AbstractContract} from './abstract-contract';
import {ETHEREUM_AIRDROP_ADDRESSES} from '../../constants/contracts/ethereum-airdrop';
import Web3 from 'web3';
import BigNumber from 'bignumber.js';

export class AirdropContract extends AbstractContract {
  constructor(
    web3Provider
  ) {
    const airdropAddress = ETHEREUM_AIRDROP_ADDRESSES[+web3Provider.chainId];
    super(web3Provider, ETHEREUM_AIRDROP_ABI, airdropAddress);
  }

  public async getFee(): Promise<any> {
    return this.contract.methods.fee().call();
  }


  private async gasLimit(): Promise<any> {
    return (await this.web3.eth.getBlock('latest')).gasLimit;
  }

  public async tokensMultiSendGas(testTokenAddress): Promise<any> {

    const addressesLengthTest = 500;

    const fee = await this.getFee();
    const blockGasLimit = await this.gasLimit();
    const web3 = new Web3();
    const accounts = Array(addressesLengthTest).fill(null);
    const promises = [];

    accounts.forEach((address, index) => {
      if ((index !== 0) && (index !== (addressesLengthTest - 1))) {
        return;
      }
      const addressesArray = Array(index + 1);
      addressesArray.fill(web3.eth.accounts);

      const addresses = addressesArray.map((creator) => {
        const account = creator.create();
        return account.address;
      });
      const amountsArray = Array(addresses.length);
      amountsArray.fill('1');
      const tx = this.contract.methods.multisendToken(
        testTokenAddress,
        addresses,
        amountsArray,
        amountsArray.length.toString(10)
      );

      const data = tx.encodeABI();
      // console.trace();
      console.log('Fee: ', fee);
      console.log('walletAddress: ', this.walletAddress);
      console.log('contractAddress: ', this.contractAddress);

      promises.push(
        this.web3.eth.estimateGas({
          from: this.walletAddress,
          to: this.contractAddress,
          value: fee,
          data
        })
      );
    });


    return new Promise((resolve, reject) => {
      Promise.all(promises).then((result) => {
        if (!result[0] || !result[1]) {
          return reject();
        }
        const oneAddressAdding = (result[1] - result[0]) / (addressesLengthTest - 1);
        const initTransaction = result[0] - oneAddressAdding;
        const maxAddressesLength = Math.floor((blockGasLimit - initTransaction) / oneAddressAdding) - 1;

        // console.log('Latest block gas limit:', blockGasLimit);
        // console.log('Gas limit per address:', oneAddressAdding);
        // console.log('Gas limit of first address:', initTransaction);
        // console.log('Max addresses length per tx:', maxAddressesLength);

        resolve({
          maxAddressesLength,
          gasLimitPerAddress: oneAddressAdding,
          gasLimitForFirstAddress: result[0]
        });
      }, reject);
    });

  }

  private async getTransaction(token, addresses): Promise<any> {
    let fullAmount = new BigNumber(0);
    const txParams = addresses.reduce((data, item) => {
      const itemAmount = new BigNumber(item.amount).times(Math.pow(10, token.decimals));
      fullAmount = fullAmount.plus(itemAmount);
      data.addresses.push(item.address.toLowerCase());
      data.amounts.push(itemAmount.toString(10));
      return data;
    }, {addresses: [], amounts: []});
    return this.contract.methods.multisendToken(
      token.address,
      txParams.addresses,
      txParams.amounts,
      fullAmount.toString(10)
    );
  }

  public async sendTokensToAddresses(token, addresses, gasLimit, gasPrice): Promise<any> {
    const tx = await this.getTransaction(token, addresses);
    const fee = await this.getFee();

    const txSend = tx.send({
      from: this.walletAddress,
      value: fee,
      // gas: gasLimit,
      gasPrice
    });

    let txResolver;
    let rejector;

    const checkerPromise = new Promise((resolve, reject) => {
      txResolver = resolve;
      rejector = reject;
    });

    txSend.catch(rejector);

    return {
      checker: checkerPromise.then((transactionHash) => {
        return this.checkTransaction(transactionHash);
      }),
      hash: new Promise((resolve) => {
        txSend.once('transactionHash', (txHash) => {
          txResolver(txHash);
          resolve(txHash);
        });
      })
    };
  }

}
