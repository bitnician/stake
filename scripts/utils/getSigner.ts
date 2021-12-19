import { Signer } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

async function getSigner(hre: HardhatRuntimeEnvironment): Promise<Signer> {
  if (process.env.FRAME) {
    const provider = new hre.ethers.providers.JsonRpcProvider(
      "http://127.0.0.1:1248"
    );

    const frameNetwork = await provider.getNetwork();

    const hreProvider = hre.ethers.provider;
    const hreNetwork = await hreProvider.getNetwork();

    if (frameNetwork.chainId !== hreNetwork.chainId) {
      throw new Error(
        `The network you are trying to deploy to (${hreNetwork.chainId} / ${hreNetwork.name}) is not the same as the network you are trying to connect to (${frameNetwork.chainId} / ${frameNetwork.name}).`
      );
    }
    return provider.getSigner();
  } else {
    return (await hre.ethers.getSigners())[0];
  }
}

export { getSigner };
