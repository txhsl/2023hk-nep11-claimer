using Neo;
using Neo.SmartContract;
using Neo.SmartContract.Framework;
using Neo.SmartContract.Framework.Attributes;
using Neo.SmartContract.Framework.Native;
using Neo.SmartContract.Framework.Services;
using System.ComponentModel;
using System.Numerics;

namespace HK2023NFT
{
    [DisplayName("HK2023NFT")]
    [SupportedStandards("NEP-11")]
    [ContractPermission("*", "onNEP11Payment")]
    [ManifestExtra("Description", "This is HK2023 Event NFT")]
    public class HK2023NFT : Nep11Token<TokenState>
    {
        [InitialValue("NWUAu35ApUsdUkeRNDvirP3Vmwah5q4Jr7", ContractParameterType.Hash160)]
        public static readonly UInt160 Admin = default;

        [Safe]
        public override string Symbol() => "HK2023";

        [Safe]
        public override Map<string, object> Properties(ByteString tokenId)
        {
            var tokenMap = new StorageMap(Storage.CurrentContext, Prefix_Token);
            var token = (TokenState)StdLib.Deserialize(tokenMap[tokenId]);
            var map = new Map<string, object>();
            map["name"] = token.Name;
            map["image"] = token.Image;
            return map;
        }

        [Safe]
        public static BigInteger Count()
        {
            var prefix = new byte[] { Prefix_TokenId };
            var id = Storage.Get(Storage.CurrentReadOnlyContext, prefix);
            return (BigInteger)id;
        }

        public static void MintToken(UInt160 to, string image)
        {
            ExecutionEngine.Assert(Runtime.CheckWitness(Admin));
            var id = NewTokenId();
            var token = new TokenState()
            {
                Owner = to,
                Name = "HK2023 #" + Count().ToString(),
                Image = image
            };
            Mint(id, token);
        }
    }
}
