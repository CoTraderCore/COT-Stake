import { BN, fromWei, toWei } from 'web3-utils'
import ether from './helpers/ether'
import EVMRevert from './helpers/EVMRevert'
import { duration } from './helpers/duration'
import { PairHash } from '../config'


const BigNumber = BN
const timeMachine = require('ganache-time-traveler')

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should()

const ETH_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

// real contracts
const UniswapV2Factory = artifacts.require('./UniswapV2Factory.sol')
const UniswapV2Router = artifacts.require('./UniswapV2Router02.sol')
const UniswapV2Pair = artifacts.require('./UniswapV2Pair.sol')
const WETH = artifacts.require('./WETH9.sol')
const TOKEN = artifacts.require('./Token.sol')
const StakeClaim = artifacts.require('./StakeClaim.sol')
const StakeNonClaim = artifacts.require('./StakeNonClaim.sol')
const Sale = artifacts.require('./Sale.sol')

const Beneficiary = "0x6ffFe11A5440fb275F30e0337Fc296f938a287a5"

let uniswapV2Factory,
    uniswapV2Router,
    weth,
    token,
    pair,
    pairAddress,
    stakeClaim,
    stakeNonClaim,
    sale


contract('Sale-test', function([userOne, userTwo, userThree]) {

  async function deployContracts(){
    // deploy contracts
    uniswapV2Factory = await UniswapV2Factory.new(userOne)
    weth = await WETH.new()
    uniswapV2Router = await UniswapV2Router.new(uniswapV2Factory.address, weth.address)
    token = await TOKEN.new(toWei(String(100000)))

    // add token liquidity
    await token.approve(uniswapV2Router.address, toWei(String(500)))

    await uniswapV2Router.addLiquidityETH(
      token.address,
      toWei(String(500)),
      1,
      1,
      userOne,
      "1111111111111111111111"
    , { from:userOne, value:toWei(String(500)) })

    pairAddress = await uniswapV2Factory.allPairs(0)
    pair = await UniswapV2Pair.at(pairAddress)

    stakeClaim = await StakeClaim.new(
      userOne,
      token.address,
      pair.address,
      duration.days(30)
    )

    stakeNonClaim = await StakeNonClaim.new(
      userOne,
      token.address,
      pair.address,
      duration.days(30)
    )

    sale = await Sale.new(
      token.address,
      Beneficiary,
      uniswapV2Router.address
    )

    // add some rewards to claim stake
    stakeClaim.setRewardsDistribution(userOne)
    token.transfer(stakeClaim.address, toWei(String(1)))
    stakeClaim.notifyRewardAmount(toWei(String(1)))

    // add some rewards to non claim stake
    stakeNonClaim.setRewardsDistribution(userOne)
    token.transfer(stakeNonClaim.address, toWei(String(1)))
    stakeNonClaim.notifyRewardAmount(toWei(String(1)))

    // send some tokens to another users
    await token.transfer(userTwo, toWei(String(1)))
    await token.transfer(userThree, toWei(String(1)))

    // send tokens to sale
    await token.transfer(sale.address, toWei(String(10000)))
  }

  beforeEach(async function() {
    await deployContracts()
  })

  describe('INIT Sale', function() {
    it('Correct init token sale', async function() {
      assert.equal(await sale.token(), token.address)
      assert.equal(await sale.beneficiary(), Beneficiary)
      assert.equal(await sale.Router(), uniswapV2Router.address)
    })
  })


  describe('Update benificiary', function() {
    it('Not owner can not call updateBeneficiary', async function() {
      await sale.updateBeneficiary(userTwo, { from:userTwo })
      .should.be.rejectedWith(EVMRevert)
    })

    it('Owner can call updateBeneficiary', async function() {
      await sale.updateBeneficiary(userTwo)
      assert.equal(await sale.beneficiary(), userTwo)
    })
  })

  describe('Withdraw unused', function() {
    it('Not owner can not call withdrawUnused', async function() {
      const saleBalance = await token.balanceOf(sale.address)
      assert.isTrue(saleBalance > 0)

      await sale.withdrawUnused(saleBalance, { from:userTwo })
      .should.be.rejectedWith(EVMRevert)

      assert.equal(Number(await token.balanceOf(sale.address)), Number(saleBalance))
    })

    it('Owner can call withdrawUnused and get unused tokens', async function() {
      const saleBalance = await token.balanceOf(sale.address)
      // reset owner balance
      await token.transfer(userTwo, await token.balanceOf(userOne))
      assert.isTrue(saleBalance > 0)
      assert.equal(await token.balanceOf(userOne), 0)

      await sale.withdrawUnused(saleBalance)
      // owner should receive all tokens from sale
      assert.equal(Number(await token.balanceOf(userOne)), Number(saleBalance))
      assert.equal(await token.balanceOf(sale.address), 0)
    })
  })

  describe('Token sale', function() {
    it('Not Owner can NOT pause and unpause sale ', async function() {
      await sale.pause({ from:userTwo })
      .should.be.rejectedWith(EVMRevert)

      await sale.unpause({ from:userTwo })
      .should.be.rejectedWith(EVMRevert)
    })

    it('Owner can pause and unpause sale ', async function() {
      await sale.pause()
      await sale.buy({ from:userTwo, value:toWei(String(1)) })
      .should.be.rejectedWith(EVMRevert)

      await sale.unpause()
      const tokenBalanceBefore = await token.balanceOf(userTwo)
      await sale.buy({ from:userTwo, value:toWei(String(1)) })
      assert.isTrue(
        await token.balanceOf(userTwo) > tokenBalanceBefore
      )
    })

    it('User can buy from sale, just send ETH', async function() {
      const tokenBalanceBefore = await token.balanceOf(userTwo)

      await sale.sendTransaction({
        value: toWei(String(1)),
        from:userTwo
      })

      assert.isTrue(
        await token.balanceOf(userTwo) > tokenBalanceBefore
      )
    })

    it('User can buy from sale, via call function buy', async function() {
      const tokenBalanceBefore = await token.balanceOf(userTwo)

      await sale.buy({ from:userTwo, value:toWei(String(1)) })

      assert.isTrue(
        await token.balanceOf(userTwo) > tokenBalanceBefore
      )
    })

    it('Sale rate should be same as in DEX ', async function() {
      // clear user 2 balance
      await token.transfer(userOne, await token.balanceOf(userTwo), { from:userTwo })
      assert.equal(await token.balanceOf(userTwo), 0)
      const saleRate = await sale.getSalePrice(toWei(String(1)))

      await uniswapV2Router.swapExactETHForTokens(
        1,
        [weth.address, token.address],
        userTwo,
        "1111111111111111111111",
        { from:userTwo, value:toWei(String(1)) }
      )

      assert.equal(
        Number(saleRate),
        Number(await token.balanceOf(userTwo))
      )
    })

    it('Sale rate should be still same as in DEX after update LD', async function() {
      // clear user 2 balance
      await token.transfer(userOne, await token.balanceOf(userTwo), { from:userTwo })
      assert.equal(await token.balanceOf(userTwo), 0)

      // ADD LD
      const totalLDBefore = await pair.totalSupply()
      await token.approve(uniswapV2Router.address, toWei(String(10)))
      await uniswapV2Router.addLiquidityETH(
        token.address,
        toWei(String(10)),
        1,
        1,
        userOne,
        "1111111111111111111111"
      , { from:userOne, value:toWei(String(10)) })
      // should be add new LD
      assert.isTrue(Number(await pair.totalSupply()) > Number(totalLDBefore))

      const saleRate = await sale.getSalePrice(toWei(String(1)))

      await uniswapV2Router.swapExactETHForTokens(
        1,
        [weth.address, token.address],
        userTwo,
        "1111111111111111111111",
        { from:userTwo, value:toWei(String(1)) }
      )

      assert.equal(
        Number(saleRate),
        Number(await token.balanceOf(userTwo))
      )
    })
  })
  //END
})
