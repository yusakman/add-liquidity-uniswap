const { ethers } = require("ethers");
const { Token, MaxUint256 } = require("@uniswap/sdk-core");
const { Pool, Position, nearestUsableTick } = require("@uniswap/v3-sdk");
const {
  abi: IUniswapV3PoolABI,
} = require("@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json");
const {
  abi: INonfungiblePositionManagerABI,
} = require("@uniswap/v3-periphery/artifacts/contracts/interfaces/INonfungiblePositionManager.sol/INonfungiblePositionManager.json");
const ERC20ABI = require("../abi.json");

require("dotenv").config();

const ANKR_URL = process.env.ANKR_URL;
const PRIV_KEY = process.env.PRIV_KEY;

const addresses = {
  poolAddress: "0x4d1892f15B03db24b55E73F9801826a56d6f0755", // WETH-UNI on Goerli
  positionManagerAddress: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88", // NonfungiblePositionManager
  wethAddress: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6", // WETH on Goerli
  uniAddress: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", // UNI on Goerli
};

const provider = new ethers.providers.JsonRpcProvider(ANKR_URL);

const chainId = 5;

const uniContract = new ethers.Contract(
  addresses.uniAddress,
  ERC20ABI,
  provider
);

const wethContract = new ethers.Contract(
  addresses.wethAddress,
  ERC20ABI,
  provider
);

const nonfungiblePositionMangerContract = new ethers.Contract(
  addresses.positionManagerAddress,
  INonfungiblePositionManagerABI,
  provider
);

const poolContract = new ethers.Contract(
  addresses.poolAddress,
  IUniswapV3PoolABI,
  provider
);

async function getPoolData(poolContract) {
  const [tickSpacing, fee, liquidity, slot0] = await Promise.all([
    poolContract.tickSpacing(),
    poolContract.fee(),
    poolContract.liquidity(),
    poolContract.slot0(),
  ]);

  return {
    tickSpacing,
    fee,
    liquidity,
    sqrtPriceX96: slot0[0],
    tick: slot0[1],
  };
}

async function main() {
  // Interacting with the tokens
  const token0 = {
    name: await uniContract.name(),
    symbol: await uniContract.symbol(),
    decimals: await uniContract.decimals(),
    address: addresses.uniAddress,
  };

  const token1 = {
    name: await wethContract.name(),
    symbol: await wethContract.symbol(),
    decimals: await wethContract.decimals(),
    address: addresses.wethAddress,
  };

  const uniToken = new Token(
    chainId,
    token0.address,
    token0.decimals,
    token0.symbol,
    token0.name
  );

  const wethToken = new Token(
    chainId,
    token1.address,
    token1.decimals,
    token1.symbol,
    token1.name
  );

  // Interacting with the pool
  const poolData = await getPoolData(poolContract);

  // Create an instance of the pool
  const UNI_WETH_POOL = new Pool(
    uniToken,
    wethToken,
    poolData.fee,
    poolData.sqrtPriceX96.toString(),
    poolData.liquidity.toString(),
    poolData.tick
  );

  const position = new Position({
    pool: UNI_WETH_POOL,
    liquidity: ethers.utils.parseUnits("0.05", 18),
    tickLower:
      nearestUsableTick(poolData.tick, poolData.tickSpacing) -
      poolData.tickSpacing * 2,
    tickUpper:
      nearestUsableTick(poolData.tick, poolData.tickSpacing) +
      poolData.tickSpacing * 2,
  });

  const wallet = new ethers.Wallet(PRIV_KEY, provider);

  const approvalAmount = ethers.utils.parseUnits("2", 18).toString();

  const uniApproval = await uniContract
    .connect(wallet)
    .approve(addresses.positionManagerAddress, approvalAmount);
  const wethApproval = await wethContract
    .connect(wallet)
    .approve(addresses.positionManagerAddress, approvalAmount);

  console.log("Uni Approval", uniApproval);
  console.log("Weth Approval", wethApproval);

  const {amount0: amount0Desired, amount1: amount1Desired} = position.mintAmounts

  let params = {
    token0: token0.address,
    token1: token1.address,
    fee: poolData.fee,
    tickLower:
      nearestUsableTick(poolData.tick, poolData.tickSpacing) -
      poolData.tickSpacing * 2,
    tickUpper:
      nearestUsableTick(poolData.tick, poolData.tickSpacing) +
      poolData.tickSpacing * 2,
    amount0Desired: amount0Desired.toString(),
    amount1Desired: amount1Desired.toString(),
    amount0Min: amount0Desired.toString(),
    amount1Min: amount1Desired.toString(),
    recipient: wallet.address, // Your wallet address
    deadline: Math.floor(Date.now() / 1000) + 60 * 10,
  };

  nonfungiblePositionMangerContract.connect(wallet).mint(
    params,
    {
        gasLimit: ethers.utils.hexlify(1000000)
    }
  ).then((res) => {
    console.log(res)
  })
}

main();
