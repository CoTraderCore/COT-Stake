// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.6.2;


import '../dex/interfaces/IUniswapV2Router02.sol';
import '../dex/interfaces/IUniswapV2Pair.sol';
import '../openzeppelin-contracts/contracts/math/Math.sol';
import '../openzeppelin-contracts/contracts/math/SafeMath.sol';
import '../openzeppelin-contracts/contracts/token/ERC20/IERC20.sol';


contract DEXFormula {
  using SafeMath for uint256;

  IUniswapV2Router02 public Router;

  constructor(address _Router) public {
    Router = IUniswapV2Router02(_Router);
  }

  // calcualte pool amount to mint by pool connectors amount
  function calculatePoolToMint(uint256 amount0, uint256 amount1, address pair)
    public
    view
    returns(uint256 liquidity)
  {
    (uint256 reserve0, uint256 reserve1, ) = IUniswapV2Pair(pair).getReserves();
    uint256 totalSupply = IUniswapV2Pair(pair).totalSupply();

    liquidity = Math.min(
      amount0.mul(totalSupply) / reserve0,
      amount1.mul(totalSupply) / reserve1
    );
  }

  // calculate weth based pool amount by second token (not WETH)
  function getPoolAmountByWant(uint256 _wantAmount, address pair, address want)
    public
    view
    returns(uint256 liquidity)
  {
     uint256 WETH_AMOUNT = routerRatio(want, Router.WETH(), _wantAmount);
     liquidity = calculatePoolToMint(WETH_AMOUNT, _wantAmount, pair);
  }

  // helper for get amounts for both Uniswap connectors for input amount of pool for Uniswap version 2
  function getConnectorsAmountByPoolAmount(
    uint256 _amount,
    address _exchange
  )
    public
    view
    returns(
      uint256 tokenAmountOne,
      uint256 tokenAmountTwo,
      address tokenAddressOne,
      address tokenAddressTwo
    )
  {
    tokenAddressOne = IUniswapV2Pair(_exchange).token0();
    tokenAddressTwo = IUniswapV2Pair(_exchange).token1();
    // total_liquidity exchange.totalSupply
    uint256 totalLiquidity = IERC20(_exchange).totalSupply();
    // ethAmount = amount * exchane.eth.balance / total_liquidity
    tokenAmountOne = _amount.mul(IERC20(tokenAddressOne).balanceOf(_exchange)).div(totalLiquidity);
    // ercAmount = amount * token.balanceOf(exchane) / total_liquidity
    tokenAmountTwo = _amount.mul(IERC20(tokenAddressTwo).balanceOf(_exchange)).div(totalLiquidity);
  }

  // helpers for get ratio from router
  function routerRatio(address from, address to, uint256 fromAmount) public view returns (uint256){
    if(from == to)
      return fromAmount;

    address[] memory path = new address[](2);
    path[0] = from;
    path[1] = to;
    uint256[] memory res = Router.getAmountsOut(fromAmount, path);
    return res[1];
  }

  function routerRatioByCustomRouter(address from, address to, uint256 fromAmount, address _router) public view returns (uint256){
    if(from == to)
      return fromAmount;

    address[] memory path = new address[](2);
    path[0] = from;
    path[1] = to;
    uint256[] memory res = IUniswapV2Router02(_router).getAmountsOut(fromAmount, path);
    return res[1];
  }

  // helper for get ratio between pools in Uniswap network version 2
  // _from - should be uniswap pool address
  function convertPoolConnectorsToDestanationToken(
    address _pool,
    address _toToken,
    uint256 _amount
  )
  public
  view
  returns (uint256)
  {
    // get connectors amount by pool share
    (uint256 tokenAmountOne,
     uint256 tokenAmountTwo,
     address tokenAddressOne,
     address tokenAddressTwo) = getConnectorsAmountByPoolAmount(_amount, _pool);

    // convert connectors amount via DEX aggregator
    uint256 amountOne = routerRatio(tokenAddressOne, _toToken, tokenAmountOne);
    uint256 amountTwo = routerRatio(tokenAddressTwo, _toToken, tokenAmountTwo);
    // return value
    return amountOne + amountTwo;
  }
}
