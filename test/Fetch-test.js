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
const Fetch = artifacts.require('./Fetch.sol')
const Sale = artifacts.require('./Sale.sol')

const Beneficiary = "0x6ffFe11A5440fb275F30e0337Fc296f938a287a5"

let pancakeFactory,
    pancakeRouter,
    weth,
    token,
    pair,
    pancakePairAddress,
    stakeClaim,
    stakeNonClaim,
    stakeClaimSecond,
    stakeNonClaimSecond,
    fetch,
    sale


contract('Fetch-test', function([userOne, userTwo, userThree]) {

  async function deployContracts(){
    // deploy contracts
    weth = await WETH.new()

    pancakeFactory = await UniswapV2Factory.new(userOne)
    pancakeRouter = await UniswapV2Router.new(pancakeFactory.address, weth.address)

    token = await TOKEN.new(toWei(String(100000)))

    // add token liquidity to Pancake
    await token.approve(pancakeRouter.address, toWei(String(500)))
    await pancakeRouter.addLiquidityETH(
      token.address,
      toWei(String(500)),
      1,
      1,
      userOne,
      "1111111111111111111111"
    , { from:userOne, value:toWei(String(500)) })



    pancakePairAddress = await pancakeFactory.allPairs(0)
    pair = await UniswapV2Pair.at(pancakePairAddress)

    stakeClaim = await StakeClaim.new(
      userOne,
      token.address,
      pair.address,
      duration.days(30)
    )

    stakeClaimSecond = await StakeClaim.new(
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

    stakeNonClaimSecond = await StakeNonClaim.new(
      userOne,
      token.address,
      pair.address,
      duration.days(30)
    )

    sale = await Sale.new(
      token.address,
      Beneficiary,
      pancakeRouter.address
    )

    fetch = await Fetch.new(
      weth.address,
      pancakeRouter.address,
      stakeClaim.address,
      stakeNonClaim.address,
      token.address,
      pair.address,
      sale.address
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

  describe('INIT', function() {
    it('PairHash correct', async function() {
      assert.equal(
        String(await pancakeFactory.pairCodeHash()).toLowerCase(),
        String(PairHash).toLowerCase(),
      )
    })

    it('Correct init name and symbol for pair', async function() {
      assert.equal(
        await pair.name(),
        'CoSwap'
      )

      assert.equal(
        await pair.symbol(),
        'COS-v2'
      )
    })

    it('Factory in Router correct', async function() {
      assert.equal(
        String(await pancakeRouter.factory()).toLowerCase(),
        String(pancakeFactory.address).toLowerCase(),
      )
    })

    it('WETH in Router correct', async function() {
      assert.equal(
        String(await pancakeRouter.WETH()).toLowerCase(),
        String(weth.address).toLowerCase(),
      )
    })

    it('Correct init token supply', async function() {
      assert.equal(
        await token.totalSupply(),
        toWei(String(100000)),
      )
    })

    it('Correct init claim Stake', async function() {
      assert.equal(await stakeClaim.rewardsToken(), token.address)
      assert.equal(await stakeClaim.stakingToken(), pair.address)
    })

    it('Correct init non claim Stake', async function() {
      assert.equal(await stakeNonClaim.rewardsToken(), token.address)
      assert.equal(await stakeNonClaim.stakingToken(), pair.address)
    })

    it('Correct init token sale', async function() {
      assert.equal(await sale.token(), token.address)
      assert.equal(await sale.beneficiary(), Beneficiary)
      assert.equal(await sale.Router(), pancakeRouter.address)
    })

    it('token should be added in LD DEX', async function() {
      assert.equal(await pair.totalSupply(), toWei(String(500)))
    })
  })


  describe('Update split percent ', function() {
    async function testFetch(){
      // user two not hold any pool before deposit
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // stake don't have any pool yet
      assert.equal(Number(await pair.balanceOf(stakeClaim.address)), 0)
      // approve token
      await token.approve(fetch.address, toWei(String(0.1)), { from:userTwo })
      // deposit
      await fetch.depositETHAndERC20(true, toWei(String(0.1)), { from:userTwo, value:toWei(String(0.1)) })
      // fetch send all pool
      assert.equal(Number(await pair.balanceOf(fetch.address)), 0)
      // fetch send all shares
      assert.equal(Number(await stakeClaim.balanceOf(fetch.address)), 0)
      // fetch send all ETH remains
      assert.equal(Number(await web3.eth.getBalance(fetch.address)), 0)
      // fetch send all WETH remains
      assert.equal(Number(await weth.balanceOf(fetch.address)), 0)
      // fetch send all token
      assert.equal(Number(await token.balanceOf(fetch.address)), 0)
      // user should receive tokens
      assert.notEqual(Number(await stakeClaim.balanceOf(userTwo)), 0)
      // user should receive token shares
      const stakePool = Number(await pair.balanceOf(stakeClaim.address))
      const burnPool = Number(await pair.balanceOf("0x0000000000000000000000000000000000000000"))
      // stake should receive pool
      assert.notEqual(stakePool, 0)
      // burn address should receive tokens
      assert.notEqual(burnPool, 0)
      // stake should get more tahn burn
      assert.isTrue(stakePool > burnPool)
      // burn shoukd get 10% by default
      assert.equal(
        Number(fromWei(String(stakePool))).toFixed(4),
        Number(fromWei(String(burnPool * 9))).toFixed(4),
      )
    }

    it('Fetch works if split 0% sale and 100% pool', async function() {
      // update split 0% sale, 100% pool
      await fetch.updateSplit(0, 100)
      await testFetch()
    })

    it('Fetch works if split 100% sale and 0% pool', async function() {
      // update split 100% sale, 0% pool
      await fetch.updateSplit(100, 0)
      await testFetch()
    })
  })


  describe('Update burn percent', function() {
    it('Not owner can not call updateBurnPercent', async function() {
      const stakeAddressBefore = await fetch.stakeClaimAble()

      await fetch.updateBurnPercent(
        5,
        { from:userTwo }
      ).should.be.rejectedWith(EVMRevert)
    })

    it('Owner can not call updateBurnPercent with wrong %', async function() {
      const stakeAddressBefore = await fetch.stakeClaimAble()

      await fetch.updateBurnPercent(
        0
      ).should.be.rejectedWith(EVMRevert)

      await fetch.updateBurnPercent(
        11
      ).should.be.rejectedWith(EVMRevert)

    })

    it('Owner can call updateBurnPercent and fetch now works with new 5% percent', async function() {
      // update address
      await fetch.updateBurnPercent(5)
      // test new stake
      // user two not hold any pool before deposit
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // stake don't have any pool yet
      assert.equal(Number(await pair.balanceOf(stakeClaim.address)), 0)
      // deposit
      await fetch.deposit(true, { from:userTwo, value:toWei(String(1)) })
      // fetch send all pool
      assert.equal(Number(await pair.balanceOf(fetch.address)), 0)
      // fetch send all shares
      assert.equal(Number(await stakeClaim.balanceOf(fetch.address)), 0)
      // fetch send all ETH remains
      assert.equal(Number(await web3.eth.getBalance(fetch.address)), 0)
      // fetch send all WETH remains
      assert.equal(Number(await weth.balanceOf(fetch.address)), 0)
      // fetch send all token
      assert.equal(Number(await token.balanceOf(fetch.address)), 0)
      // user should receive tokens
      assert.notEqual(Number(await stakeClaim.balanceOf(userTwo)), 0)
      // user should receive token shares
      const stakePool = Number(await pair.balanceOf(stakeClaim.address))
      const burnPool = Number(await pair.balanceOf("0x0000000000000000000000000000000000000000"))
      // stake should receive pool
      assert.notEqual(stakePool, 0)
      // burn address should receive tokens
      assert.notEqual(burnPool, 0)
      // stake should get more tahn burn
      assert.isTrue(stakePool > burnPool)
      // burn shoukd get 10% by default
      assert.equal(
        Number(fromWei(String(stakePool))).toFixed(4),
        Number(fromWei(String(burnPool * 19))).toFixed(4),
      )
    })
  })

  describe('Update stakes addresses in fetch', function() {
    it('Not owner can not call changeStakeClaimAble', async function() {
      const stakeAddressBefore = await fetch.stakeClaimAble()

      await fetch.changeStakeClaimAble(
        stakeClaimSecond.address,
        { from:userTwo }
      ).should.be.rejectedWith(EVMRevert)

      assert.equal(await fetch.stakeClaimAble(), stakeAddressBefore)
    })

    it('Not owner can not call changeStakeNonClaimAble', async function() {
      const stakeAddressBefore = await fetch.stakeNonClaimAble()

      await fetch.changeStakeClaimAble(
        stakeClaimSecond.address,
        { from:userTwo }
      ).should.be.rejectedWith(EVMRevert)

      assert.equal(await fetch.stakeNonClaimAble(), stakeAddressBefore)
    })

    it('Owner can call changeStakeClaimAble and fetch works with new address', async function() {
      // update address
      await fetch.changeStakeClaimAble(stakeClaimSecond.address)
      assert.equal(await fetch.stakeClaimAble(), stakeClaimSecond.address)

      // test new stake
      // user two not hold any pool before deposit
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // stake don't have any pool yet
      assert.equal(Number(await pair.balanceOf(stakeClaimSecond.address)), 0)
      // deposit
      await fetch.deposit(true, { from:userTwo, value:toWei(String(1)) })
      // fetch send all pool
      assert.equal(Number(await pair.balanceOf(fetch.address)), 0)
      // fetch send all shares
      assert.equal(Number(await stakeClaimSecond.balanceOf(fetch.address)), 0)
      // fetch send all ETH remains
      assert.equal(Number(await web3.eth.getBalance(fetch.address)), 0)
      // fetch send all WETH remains
      assert.equal(Number(await weth.balanceOf(fetch.address)), 0)
      // fetch send all token
      assert.equal(Number(await token.balanceOf(fetch.address)), 0)
      // user should receive tokens
      assert.notEqual(Number(await stakeClaimSecond.balanceOf(userTwo)), 0)
      // user should receive token shares
      const stakePool = Number(await pair.balanceOf(stakeClaimSecond.address))
      const burnPool = Number(await pair.balanceOf("0x0000000000000000000000000000000000000000"))
      // stake should receive pool
      assert.notEqual(stakePool, 0)
      // burn address should receive tokens
      assert.notEqual(burnPool, 0)
      // stake should get more tahn burn
      assert.isTrue(stakePool > burnPool)
      // burn shoukd get 10% by default
      assert.equal(
        Number(fromWei(String(stakePool))).toFixed(4),
        Number(fromWei(String(burnPool * 9))).toFixed(4),
      )
    })

    it('Owner can call changeStakeNonClaimAble and fetch works with new address', async function() {
      // update stake
      await fetch.changeStakeNonClaimAble(stakeNonClaimSecond.address)
      assert.equal(await fetch.stakeNonClaimAble(), stakeNonClaimSecond.address)

      // test new address
      // user two not hold any pool before deposit
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // stake don't have any pool yet
      assert.equal(Number(await pair.balanceOf(stakeNonClaimSecond.address)), 0)
      // deposit
      await fetch.deposit(false, { from:userTwo, value:toWei(String(1)) })
      // fetch send all pool
      assert.equal(Number(await pair.balanceOf(fetch.address)), 0)
      // fetch send all shares
      assert.equal(Number(await stakeNonClaimSecond.balanceOf(fetch.address)), 0)
      // fetch send all ETH remains
      assert.equal(Number(await web3.eth.getBalance(fetch.address)), 0)
      // fetch send all WETH remains
      assert.equal(Number(await weth.balanceOf(fetch.address)), 0)
      // fetch send all token
      assert.equal(Number(await token.balanceOf(fetch.address)), 0)
      // stake should receive pool
      assert.notEqual(Number(await pair.balanceOf(stakeNonClaimSecond.address)), 0)
      // user should receive tokens
      assert.notEqual(Number(await stakeNonClaimSecond.balanceOf(userTwo)), 0)
      // user should receive token shares
      const stakePool = Number(await pair.balanceOf(stakeNonClaimSecond.address))
      const burnPool = Number(await pair.balanceOf("0x0000000000000000000000000000000000000000"))
      // stake should receive pool
      assert.notEqual(stakePool, 0)
      // burn address should receive tokens
      assert.notEqual(burnPool, 0)
      // stake should get more tahn burn
      assert.isTrue(stakePool > burnPool)
      // burn shoukd get 10% by default
      assert.equal(
        Number(fromWei(String(stakePool))).toFixed(4),
        Number(fromWei(String(burnPool * 9))).toFixed(4),
      )
    })
  })

  describe('CLAIM ABLE token fetch WITH DEPOSIT WITH token', function() {
    it('Convert input to pool and stake via token fetch and fetch send all shares and remains back to user and burn 10% of pool', async function() {
      // user two not hold any pool before deposit
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // stake don't have any pool yet
      assert.equal(Number(await pair.balanceOf(stakeClaim.address)), 0)
      // approve token
      await token.approve(fetch.address, toWei(String(0.1)), { from:userTwo })
      // deposit
      await fetch.depositETHAndERC20(true, toWei(String(0.1)), { from:userTwo, value:toWei(String(0.1)) })
      // fetch send all pool
      assert.equal(Number(await pair.balanceOf(fetch.address)), 0)
      // fetch send all shares
      assert.equal(Number(await stakeClaim.balanceOf(fetch.address)), 0)
      // fetch send all ETH remains
      assert.equal(Number(await web3.eth.getBalance(fetch.address)), 0)
      // fetch send all WETH remains
      assert.equal(Number(await weth.balanceOf(fetch.address)), 0)
      // fetch send all token
      assert.equal(Number(await token.balanceOf(fetch.address)), 0)
      // user should receive tokens
      assert.notEqual(Number(await stakeClaim.balanceOf(userTwo)), 0)
      // user should receive token shares
      const stakePool = Number(await pair.balanceOf(stakeClaim.address))
      const burnPool = Number(await pair.balanceOf("0x0000000000000000000000000000000000000000"))
      // stake should receive pool
      assert.notEqual(stakePool, 0)
      // burn address should receive tokens
      assert.notEqual(burnPool, 0)
      // stake should get more tahn burn
      assert.isTrue(stakePool > burnPool)
      // burn shoukd get 10% by default
      assert.equal(
        Number(fromWei(String(stakePool))).toFixed(4),
        Number(fromWei(String(burnPool * 9))).toFixed(4),
      )
    })

    it('User can withdraw converted pool via fetch from vault', async function() {
      // user not hold any pool
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // approve token
      await token.approve(fetch.address, toWei(String(0.1)), { from:userTwo })
      // deposit
      await fetch.depositETHAndERC20(true, toWei(String(0.1)), { from:userTwo, value:toWei(String(0.1)) })
      // shares should be equal to pool depsoit
      const staked = await pair.balanceOf(stakeClaim.address)
      const shares = await stakeClaim.balanceOf(userTwo)
      // staked and shares should be equal
      assert.equal(Number(shares), Number(staked))
      // withdraw
      await stakeClaim.withdraw(shares, { from:userTwo })
      // vault should burn shares
      assert.equal(await stakeClaim.balanceOf(userTwo), 0)
      // stake send all tokens
      assert.equal(Number(await pair.balanceOf(stakeClaim.address)), 0)
      // vault should send user token
      assert.equal(
        Number(await pair.balanceOf(userTwo)),
        Number(staked)
      )
    })

    it('User claim correct rewards and pool amount after exit', async function() {
      // user not hold any pool
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // approve token
      await token.approve(fetch.address, toWei(String(0.1)), { from:userTwo })
      // deposit
      await fetch.depositETHAndERC20(true, toWei(String(0.1)), { from:userTwo, value:toWei(String(0.1)) })
      // get staked amount
      const staked = await pair.balanceOf(stakeClaim.address)
      // staked should be more than 0
      assert.isTrue(staked > 0)
      // clear user balance
      await token.transfer(userOne, await token.balanceOf(userTwo), {from:userTwo})
      assert.equal(await token.balanceOf(userTwo), 0)

      await timeMachine.advanceTimeAndBlock(duration.days(31))
      // estimate rewards
      const estimateReward = await stakeClaim.earned(userTwo)
      // get user shares
      const shares = await stakeClaim.balanceOf(userTwo)
      // withdraw
      await stakeClaim.exit({ from:userTwo })
      // user should get reward
      assert.equal(Number(await token.balanceOf(userTwo)), Number(estimateReward))
      // user get pool
      assert.equal(Number(await pair.balanceOf(userTwo)), staked)
      // stake send all address
      assert.equal(Number(await pair.balanceOf(stakeClaim.address)), 0)
    })

    it('Claim rewards calculates correct for a few users after exit ', async function() {
      // user not hold any pool
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)

      // deposit form user 2
      // approve token
      await token.approve(fetch.address, toWei(String(0.1)), { from:userTwo })
      // deposit
      await fetch.depositETHAndERC20(true, toWei(String(0.1)), { from:userTwo, value:toWei(String(0.1)) })
      // clear user 2 balance
      await token.transfer(userOne, await token.balanceOf(userTwo), {from:userTwo})
      assert.equal(await token.balanceOf(userTwo), 0)

      // deposit form user 3
      // approve token
      await token.approve(fetch.address, toWei(String(0.1)), { from:userThree })
      // deposit
      await fetch.depositETHAndERC20(true, toWei(String(0.1)), { from:userThree, value:toWei(String(0.1)) })
      // clear user 3 balance
      await token.transfer(userOne, await token.balanceOf(userThree), {from:userThree})
      assert.equal(await token.balanceOf(userThree), 0)

      // increase time
      await timeMachine.advanceTimeAndBlock(duration.days(31))

      // estimate rewards
      const estimateRewardTwo = await stakeClaim.earned(userTwo)
      const estimateRewardThree = await stakeClaim.earned(userThree)

      assert.isTrue(estimateRewardTwo > toWei(String(0.49)))
      assert.isTrue(estimateRewardThree > toWei(String(0.49)))

      // withdraw
      await stakeClaim.exit({ from:userTwo })
      await stakeClaim.exit({ from:userThree })

      // users should get reward
      assert.equal(Number(await token.balanceOf(userTwo)), Number(estimateRewardTwo))
      assert.equal(Number(await token.balanceOf(userThree)), Number(estimateRewardThree))
    })

    it('token fetch can handle big deposit and after this users can continue do many small deposits ', async function() {
      // user 1 not hold any shares
      assert.equal(Number(await stakeClaim.balanceOf(userOne)), 0)
      // deposit form user 1
      // approve token
      await token.approve(fetch.address, toWei(String(500)), { from:userOne })
      // deposit
      await fetch.depositETHAndERC20(true, toWei(String(500)), { from:userOne, value:toWei(String(500)) })
      // user 1 get shares
      assert.notEqual(Number(await stakeClaim.balanceOf(userOne)), 0)

      // user 2 not hold any shares
      assert.equal(Number(await stakeClaim.balanceOf(userTwo)), 0)
      // deposit form user 2
      // approve token
      await token.approve(fetch.address, toWei(String(0.001)), { from:userTwo })
      // deposit
      await fetch.depositETHAndERC20(true, toWei(String(0.001)), { from:userTwo, value:toWei(String(0.001)) })
      // user 2 get shares
      assert.notEqual(Number(await stakeClaim.balanceOf(userTwo)), 0)
    })

    it('token fetch can handle many deposits ', async function() {
      // approve token
      await token.approve(fetch.address, toWei(String(100)), { from:userOne })

      for(let i=0; i<100;i++){
        const sharesBefore = Number(await stakeClaim.balanceOf(userOne))
        await fetch.depositETHAndERC20(true, toWei(String(0.01)), { from:userOne, value:toWei(String(0.01)) })
        assert.isTrue(
          Number(await stakeClaim.balanceOf(userOne)) > sharesBefore
        )
      }
    })
  })

  describe('NON CLAIM ABLE token fetch DEPOSIT WITH token', function() {
    it('Convert input to pool and stake via token fetch and fetch send all shares and remains back to user and fetch burn 10% by default', async function() {
      // user two not hold any pool before deposit
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // stake don't have any pool yet
      assert.equal(Number(await pair.balanceOf(stakeNonClaim.address)), 0)
      // approve token
      await token.approve(fetch.address, toWei(String(1)), { from:userTwo })
      // deposit
      await fetch.depositETHAndERC20(false, toWei(String(1)), { from:userTwo, value:toWei(String(1)) })
      // fetch send all pool
      assert.equal(Number(await pair.balanceOf(fetch.address)), 0)
      // fetch send all shares
      assert.equal(Number(await stakeNonClaim.balanceOf(fetch.address)), 0)
      // fetch send all ETH remains
      assert.equal(Number(await web3.eth.getBalance(fetch.address)), 0)
      // fetch send all WETH remains
      assert.equal(Number(await weth.balanceOf(fetch.address)), 0)
      // fetch send all token
      assert.equal(Number(await token.balanceOf(fetch.address)), 0)
      // stake should receive pool
      assert.notEqual(Number(await pair.balanceOf(stakeNonClaim.address)), 0)
      // user should receive tokens
      assert.notEqual(Number(await stakeNonClaim.balanceOf(userTwo)), 0)
      // user should receive token shares
      const stakePool = Number(await pair.balanceOf(stakeNonClaim.address))
      const burnPool = Number(await pair.balanceOf("0x0000000000000000000000000000000000000000"))
      // stake should receive pool
      assert.notEqual(stakePool, 0)
      // burn address should receive tokens
      assert.notEqual(burnPool, 0)
      // stake should get more tahn burn
      assert.isTrue(stakePool > burnPool)
      // burn shoukd get 10% by default
      assert.equal(
        Number(fromWei(String(stakePool))).toFixed(4),
        Number(fromWei(String(burnPool * 9))).toFixed(4),
      )
    })

    it('User can withdraw converted pool via fetch from vault', async function() {
      // user not hold any pool
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // approve token
      await token.approve(fetch.address, toWei(String(1)), { from:userTwo })
      // deposit
      await fetch.depositETHAndERC20(false, toWei(String(1)), { from:userTwo, value:toWei(String(1)) })
      // shares should be equal to pool depsoit
      const staked = await pair.balanceOf(stakeNonClaim.address)
      const shares = await stakeNonClaim.balanceOf(userTwo)
      // staked and shares should be equal
      assert.equal(Number(shares), Number(staked))
      // withdraw
      await stakeNonClaim.withdraw(shares, { from:userTwo })
      // vault should burn shares
      assert.equal(await stakeNonClaim.balanceOf(userTwo), 0)
      // stake send all tokens
      assert.equal(Number(await pair.balanceOf(stakeNonClaim.address)), 0)
      // vault should send user token
      assert.equal(
        Number(await pair.balanceOf(userTwo)),
        Number(staked)
      )
    })

    it('User CAN NOT claim until stake not finished', async function() {
      // user not hold any pool
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // approve token
      await token.approve(fetch.address, toWei(String(1)), { from:userTwo })
      // deposit
      await fetch.depositETHAndERC20(false, toWei(String(1)), { from:userTwo, value:toWei(String(1)) })
      // clear user balance
      await token.transfer(userOne, await token.balanceOf(userTwo), {from:userTwo})
      assert.equal(await token.balanceOf(userTwo), 0)

      await timeMachine.advanceTimeAndBlock(duration.days(15))
      // estimate rewards
      const estimateReward = await stakeNonClaim.earned(userTwo)
      assert.isTrue(estimateReward > 0)
      // get user shares
      const shares = await stakeNonClaim.balanceOf(userTwo)
      // withdraw
      await stakeNonClaim.exit({ from:userTwo })
      .should.be.rejectedWith(EVMRevert)
      // user should get reward
      assert.equal(Number(await token.balanceOf(userTwo)), 0)
    })

    it('User claim correct rewards amount after exit and get correct pool amount back ', async function() {
      // user not hold any pool
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // approve token
      await token.approve(fetch.address, toWei(String(1)), { from:userTwo })
      // deposit
      await fetch.depositETHAndERC20(false, toWei(String(1)), { from:userTwo, value:toWei(String(1)) })
      // get staked amount
      const staked = await pair.balanceOf(stakeNonClaim.address)
      // staked should be more than 0
      assert.isTrue(staked > 0)
      // clear user balance
      await token.transfer(userOne, await token.balanceOf(userTwo), {from:userTwo})
      assert.equal(await token.balanceOf(userTwo), 0)

      await timeMachine.advanceTimeAndBlock(duration.days(31))
      // estimate rewards
      const estimateReward = await stakeNonClaim.earned(userTwo)
      assert.isTrue(estimateReward > 0)
      // get user shares
      const shares = await stakeNonClaim.balanceOf(userTwo)
      // withdraw
      await stakeNonClaim.exit({ from:userTwo })
      // user should get reward
      assert.equal(Number(await token.balanceOf(userTwo)), Number(estimateReward))
      // user get pool
      assert.equal(Number(await pair.balanceOf(userTwo)), staked)
      // stake send all address
      assert.equal(Number(await pair.balanceOf(stakeNonClaim.address)), 0)
    })

    it('Claim rewards calculates correct for a few users after exit ', async function() {
      // user not hold any pool
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)

      // deposit form user 2
      // approve token
      await token.approve(fetch.address, toWei(String(1)), { from:userTwo })
      // deposit
      await fetch.depositETHAndERC20(false, toWei(String(1)), { from:userTwo, value:toWei(String(1)) })
      // clear user 2 balance
      await token.transfer(userOne, await token.balanceOf(userTwo), {from:userTwo})
      assert.equal(await token.balanceOf(userTwo), 0)

      // deposit form user 3
      // approve token
      await token.approve(fetch.address, toWei(String(1)), { from:userThree })
      // deposit
      await fetch.depositETHAndERC20(false, toWei(String(1)), { from:userThree, value:toWei(String(1)) })
      // clear user 3 balance
      await token.transfer(userOne, await token.balanceOf(userThree), {from:userThree})
      assert.equal(await token.balanceOf(userThree), 0)

      // increase time
      await timeMachine.advanceTimeAndBlock(duration.days(31))

      // estimate rewards
      const estimateRewardTwo = await stakeNonClaim.earned(userTwo)
      const estimateRewardThree = await stakeNonClaim.earned(userThree)

      // check rewards
      assert.isTrue(estimateRewardTwo > toWei(String(0.49)))
      assert.isTrue(estimateRewardThree > toWei(String(0.49)))

      // withdraw
      await stakeNonClaim.exit({ from:userTwo })
      await stakeNonClaim.exit({ from:userThree })

      // users should get reward
      assert.equal(Number(await token.balanceOf(userTwo)), Number(estimateRewardTwo))
      assert.equal(Number(await token.balanceOf(userThree)), Number(estimateRewardThree))
    })

    it('token fetch can handle big deposit and after this users can continue do many small deposits ', async function() {
      // user 1 not hold any shares
      assert.equal(Number(await stakeNonClaim.balanceOf(userOne)), 0)
      // deposit form user 1
      await token.approve(fetch.address, toWei(String(500)), { from:userOne })
      // deposit
      await fetch.depositETHAndERC20(false, toWei(String(500)), { from:userOne, value:toWei(String(500)) })
      // user 1 get shares
      assert.notEqual(Number(await stakeNonClaim.balanceOf(userOne)), 0)

      // user 2 not hold any shares
      assert.equal(Number(await stakeNonClaim.balanceOf(userTwo)), 0)
      // deposit form user 2
      await token.approve(fetch.address, toWei(String(0.01)), { from:userTwo })
      // deposit
      await fetch.depositETHAndERC20(false, toWei(String(0.01)), { from:userTwo, value:toWei(String(0.01)) })
      // user 2 get shares
      assert.notEqual(Number(await stakeNonClaim.balanceOf(userTwo)), 0)
    })

    it('token fetch can handle many deposits ', async function() {
      await token.approve(fetch.address, toWei(String(100)), { from:userOne })
      for(let i=0; i<100;i++){
        const sharesBefore = Number(await stakeNonClaim.balanceOf(userOne))
        await fetch.depositETHAndERC20(false, toWei(String(0.01)), { from:userOne, value:toWei(String(0.01)) })
        assert.isTrue(
          Number(await stakeNonClaim.balanceOf(userOne)) > sharesBefore
        )
      }
    })
  })

  describe('CLAIM ABLE token fetch DEPOSIT ONLY BNB', function() {
    it('Convert input to pool and stake via token fetch and fetch send all shares and remains back to user', async function() {
      // user two not hold any pool before deposit
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // stake don't have any pool yet
      assert.equal(Number(await pair.balanceOf(stakeClaim.address)), 0)
      // deposit
      await fetch.deposit(true, { from:userTwo, value:toWei(String(1)) })
      // fetch send all pool
      assert.equal(Number(await pair.balanceOf(fetch.address)), 0)
      // fetch send all shares
      assert.equal(Number(await stakeClaim.balanceOf(fetch.address)), 0)
      // fetch send all ETH remains
      assert.equal(Number(await web3.eth.getBalance(fetch.address)), 0)
      // fetch send all WETH remains
      assert.equal(Number(await weth.balanceOf(fetch.address)), 0)
      // fetch send all token
      assert.equal(Number(await token.balanceOf(fetch.address)), 0)
      // user should receive token shares
      assert.notEqual(Number(await stakeClaim.balanceOf(userTwo)), 0)
      // user should receive tokens
      assert.notEqual(Number(await stakeClaim.balanceOf(userTwo)), 0)
      // user should receive token shares
      const stakePool = Number(await pair.balanceOf(stakeClaim.address))
      const burnPool = Number(await pair.balanceOf("0x0000000000000000000000000000000000000000"))
      // stake should receive pool
      assert.notEqual(stakePool, 0)
      // burn address should receive tokens
      assert.notEqual(burnPool, 0)
      // stake should get more tahn burn
      assert.isTrue(stakePool > burnPool)
      // burn shoukd get 10% by default
      assert.equal(
        Number(fromWei(String(stakePool))).toFixed(4),
        Number(fromWei(String(burnPool * 9))).toFixed(4),
      )
    })

    it('User can withdraw converted pool via fetch from vault', async function() {
      // user not hold any pool
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // deposit
      await fetch.deposit(true, { from:userTwo, value:toWei(String(1)) })
      // shares should be equal to pool depsoit
      const staked = await pair.balanceOf(stakeClaim.address)
      const shares = await stakeClaim.balanceOf(userTwo)
      // staked and shares should be equal
      assert.equal(Number(shares), Number(staked))
      // withdraw
      await stakeClaim.withdraw(shares, { from:userTwo })
      // vault should burn shares
      assert.equal(await stakeClaim.balanceOf(userTwo), 0)
      // stake send all tokens
      assert.equal(Number(await pair.balanceOf(stakeClaim.address)), 0)
      // vault should send user token
      assert.equal(
        Number(await pair.balanceOf(userTwo)),
        Number(staked)
      )
    })

    it('User claim correct rewards and pool amount after exit', async function() {
      // user not hold any pool
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // deposit
      await fetch.deposit(true, { from:userTwo, value:toWei(String(1)) })
      // get staked amount
      const staked = await pair.balanceOf(stakeClaim.address)
      // staked should be more than 0
      assert.isTrue(staked > 0)
      // clear user balance
      await token.transfer(userOne, await token.balanceOf(userTwo), {from:userTwo})
      assert.equal(await token.balanceOf(userTwo), 0)

      await timeMachine.advanceTimeAndBlock(duration.days(31))
      // estimate rewards
      const estimateReward = await stakeClaim.earned(userTwo)
      // get user shares
      const shares = await stakeClaim.balanceOf(userTwo)
      // withdraw
      await stakeClaim.exit({ from:userTwo })
      // user should get reward
      assert.equal(Number(await token.balanceOf(userTwo)), Number(estimateReward))
      // user get pool
      assert.equal(Number(await pair.balanceOf(userTwo)), staked)
      // stake send all address
      assert.equal(Number(await pair.balanceOf(stakeClaim.address)), 0)
    })

    it('Claim rewards calculates correct for a few users after exit ', async function() {
      // user not hold any pool
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)

      // deposit form user 2
      await fetch.deposit(true, { from:userTwo, value:toWei(String(1)) })
      // clear user 2 balance
      await token.transfer(userOne, await token.balanceOf(userTwo), {from:userTwo})
      assert.equal(await token.balanceOf(userTwo), 0)

      // deposit form user 3
      await fetch.deposit(true, { from:userThree, value:toWei(String(1)) })
      // clear user 3 balance
      await token.transfer(userOne, await token.balanceOf(userThree), {from:userThree})
      assert.equal(await token.balanceOf(userThree), 0)

      // increase time
      await timeMachine.advanceTimeAndBlock(duration.days(31))

      // estimate rewards
      const estimateRewardTwo = await stakeClaim.earned(userTwo)
      const estimateRewardThree = await stakeClaim.earned(userThree)

      // check rewards
      assert.isTrue(estimateRewardTwo > toWei(String(0.5)))
      assert.isTrue(estimateRewardThree > toWei(String(0.49)))

      // withdraw
      await stakeClaim.exit({ from:userTwo })
      await stakeClaim.exit({ from:userThree })

      // users should get reward
      assert.equal(Number(await token.balanceOf(userTwo)), Number(estimateRewardTwo))
      assert.equal(Number(await token.balanceOf(userThree)), Number(estimateRewardThree))
    })

    it('token fetch can handle big deposit and after this users can continue do many small deposits ', async function() {
      // user 1 not hold any shares
      assert.equal(Number(await stakeClaim.balanceOf(userOne)), 0)
      // deposit form user 1
      await fetch.deposit(true, { from:userOne, value:toWei(String(500)) })
      // user 1 get shares
      assert.notEqual(Number(await stakeClaim.balanceOf(userOne)), 0)

      // user 2 not hold any shares
      assert.equal(Number(await stakeClaim.balanceOf(userTwo)), 0)
      // deposit form user 2
      await fetch.deposit(true, { from:userTwo, value:toWei(String(0.001)) })
      // user 2 get shares
      assert.notEqual(Number(await stakeClaim.balanceOf(userTwo)), 0)
    })

    it('token fetch can handle many deposits ', async function() {
      for(let i=0; i<100;i++){
        const sharesBefore = Number(await stakeClaim.balanceOf(userOne))
        await fetch.deposit(true, { from:userOne, value:toWei(String(0.01)) })
        assert.isTrue(
          Number(await stakeClaim.balanceOf(userOne)) > sharesBefore
        )
      }
    })
  })

  describe('NON CLAIM ABLE token fetch DEPOSIT ONLY BNB', function() {
    it('Convert input to pool and stake via token fetch and fetch send all shares and remains back to user and fetch burn 10% of pool by default', async function() {
      // user two not hold any pool before deposit
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // stake don't have any pool yet
      assert.equal(Number(await pair.balanceOf(stakeNonClaim.address)), 0)
      // deposit
      await fetch.deposit(false, { from:userTwo, value:toWei(String(1)) })
      // fetch send all pool
      assert.equal(Number(await pair.balanceOf(fetch.address)), 0)
      // fetch send all shares
      assert.equal(Number(await stakeNonClaim.balanceOf(fetch.address)), 0)
      // fetch send all ETH remains
      assert.equal(Number(await web3.eth.getBalance(fetch.address)), 0)
      // fetch send all WETH remains
      assert.equal(Number(await weth.balanceOf(fetch.address)), 0)
      // fetch send all token
      assert.equal(Number(await token.balanceOf(fetch.address)), 0)
      // stake should receive pool
      assert.notEqual(Number(await pair.balanceOf(stakeNonClaim.address)), 0)
      // user should receive token shares
      assert.notEqual(Number(await stakeNonClaim.balanceOf(userTwo)), 0)
      // user should receive token shares
      const stakePool = Number(await pair.balanceOf(stakeNonClaim.address))
      const burnPool = Number(await pair.balanceOf("0x0000000000000000000000000000000000000000"))
      // stake should receive pool
      assert.notEqual(stakePool, 0)
      // burn address should receive tokens
      assert.notEqual(burnPool, 0)
      // stake should get more tahn burn
      assert.isTrue(stakePool > burnPool)
      // burn shoukd get 10% by default
      assert.equal(
        Number(fromWei(String(stakePool))).toFixed(4),
        Number(fromWei(String(burnPool * 9))).toFixed(4),
      )
    })

    it('User can withdraw converted pool via fetch from vault', async function() {
      // user not hold any pool
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // deposit
      await fetch.deposit(false, { from:userTwo, value:toWei(String(1)) })
      // shares should be equal to pool depsoit
      const staked = await pair.balanceOf(stakeNonClaim.address)
      const shares = await stakeNonClaim.balanceOf(userTwo)
      // staked and shares should be equal
      assert.equal(Number(shares), Number(staked))
      // withdraw
      await stakeNonClaim.withdraw(shares, { from:userTwo })
      // vault should burn shares
      assert.equal(await stakeNonClaim.balanceOf(userTwo), 0)
      // stake send all tokens
      assert.equal(Number(await pair.balanceOf(stakeNonClaim.address)), 0)
      // vault should send user token
      assert.equal(
        Number(await pair.balanceOf(userTwo)),
        Number(staked)
      )
    })

    it('User CAN NOT claim until stake not finished', async function() {
      // user not hold any pool
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // deposit
      await fetch.deposit(false, { from:userTwo, value:toWei(String(1)) })
      // clear user balance
      await token.transfer(userOne, await token.balanceOf(userTwo), {from:userTwo})
      assert.equal(await token.balanceOf(userTwo), 0)

      await timeMachine.advanceTimeAndBlock(duration.days(15))
      // estimate rewards
      const estimateReward = await stakeNonClaim.earned(userTwo)
      assert.isTrue(estimateReward > 0)
      // get user shares
      const shares = await stakeNonClaim.balanceOf(userTwo)
      // withdraw
      await stakeNonClaim.exit({ from:userTwo })
      .should.be.rejectedWith(EVMRevert)
      // user should get reward
      assert.equal(Number(await token.balanceOf(userTwo)), 0)
    })

    it('User claim correct rewards amount after exit and get correct pool amount back ', async function() {
      // user not hold any pool
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)
      // deposit
      await fetch.deposit(false, { from:userTwo, value:toWei(String(1)) })
      // get staked amount
      const staked = await pair.balanceOf(stakeNonClaim.address)
      // staked should be more than 0
      assert.isTrue(staked > 0)
      // clear user balance
      await token.transfer(userOne, await token.balanceOf(userTwo), {from:userTwo})
      assert.equal(await token.balanceOf(userTwo), 0)

      await timeMachine.advanceTimeAndBlock(duration.days(31))
      // estimate rewards
      const estimateReward = await stakeNonClaim.earned(userTwo)
      assert.isTrue(estimateReward > 0)
      // get user shares
      const shares = await stakeNonClaim.balanceOf(userTwo)
      // withdraw
      await stakeNonClaim.exit({ from:userTwo })
      // user should get reward
      assert.equal(Number(await token.balanceOf(userTwo)), Number(estimateReward))
      // user get pool
      assert.equal(Number(await pair.balanceOf(userTwo)), staked)
      // stake send all address
      assert.equal(Number(await pair.balanceOf(stakeNonClaim.address)), 0)
    })

    it('Claim rewards calculates correct for a few users after exit ', async function() {
      // user not hold any pool
      assert.equal(Number(await pair.balanceOf(userTwo)), 0)

      // deposit form user 2
      await fetch.deposit(false, { from:userTwo, value:toWei(String(1)) })
      // clear user 2 balance
      await token.transfer(userOne, await token.balanceOf(userTwo), {from:userTwo})
      assert.equal(await token.balanceOf(userTwo), 0)

      // deposit form user 3
      await fetch.deposit(false, { from:userThree, value:toWei(String(1)) })
      // clear user 3 balance
      await token.transfer(userOne, await token.balanceOf(userThree), {from:userThree})
      assert.equal(await token.balanceOf(userThree), 0)

      // increase time
      await timeMachine.advanceTimeAndBlock(duration.days(31))

      // estimate rewards
      const estimateRewardTwo = await stakeNonClaim.earned(userTwo)
      const estimateRewardThree = await stakeNonClaim.earned(userThree)

      // check rewards
      assert.isTrue(estimateRewardTwo > toWei(String(0.5)))
      assert.isTrue(estimateRewardThree > toWei(String(0.49)))

      // withdraw
      await stakeNonClaim.exit({ from:userTwo })
      await stakeNonClaim.exit({ from:userThree })

      // users should get reward
      assert.equal(Number(await token.balanceOf(userTwo)), Number(estimateRewardTwo))
      assert.equal(Number(await token.balanceOf(userThree)), Number(estimateRewardThree))
    })

    it('token fetch can handle big deposit and after this users can continue do many small deposits ', async function() {
      // user 1 not hold any shares
      assert.equal(Number(await stakeNonClaim.balanceOf(userOne)), 0)
      // deposit form user 1
      await fetch.deposit(false, { from:userOne, value:toWei(String(500)) })
      // user 1 get shares
      assert.notEqual(Number(await stakeNonClaim.balanceOf(userOne)), 0)

      // user 2 not hold any shares
      assert.equal(Number(await stakeNonClaim.balanceOf(userTwo)), 0)
      // deposit form user 2
      await fetch.deposit(false, { from:userTwo, value:toWei(String(0.001)) })
      // user 2 get shares
      assert.notEqual(Number(await stakeNonClaim.balanceOf(userTwo)), 0)
    })

    it('token fetch can handle many deposits ', async function() {
      for(let i=0; i<100;i++){
        const sharesBefore = Number(await stakeNonClaim.balanceOf(userOne))
        await fetch.deposit(false, { from:userOne, value:toWei(String(0.01)) })
        assert.isTrue(
          Number(await stakeNonClaim.balanceOf(userOne)) > sharesBefore
        )
      }
    })
  })
  //END
})
