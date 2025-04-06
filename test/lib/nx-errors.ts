export default {
  invalidRequest: /^[A-Za-z_]\w*\/invalidRequest:/,
  invalidSignature: /^[A-Za-z_]\w*\/invalidSignature:/,
  ownerForbidden: /^Ownable: caller is not the owner$|^NextOwnable\/ownerForbidden:/,
  executorForbidden: /^NextOwnable\/executorForbidden:/,
  paused: "Pausable: paused",
  notPaused: "Pausable: not paused",
  notAllowlisted: /^ApproveControlled\/notAllowlisted:/,
  unauthorized: /^BridgeToken\/unauthorized:/,
  blocklist: /^BridgeToken\/blocklist:/,
  MinimalForwarder: {
    invalidSignature: "MinimalForwarder: signature does not match request",
  },
  ERC20: {
    invalidRequest:
      /^ERC20: (transfer from the zero address|transfer to the zero address|mint to the zero address|burn from the zero address|approve from the zero address|approve to the zero address)$/,
    decreaseAllowanceConflict: "ERC20: decreased allowance below zero",
    transferNoFund: "ERC20: transfer amount exceeds balance",
    burnNoFund: "ERC20: burn amount exceeds balance",
    transferForbidden: "ERC20: insufficient allowance",
    paused: "ERC20Pausable: token transfer while paused",
  },
  ERC721: {
    invalidRequest:
      /^ERC721: (address zero is not a valid owner|mint to the zero address|transfer to the zero address|approve to caller)$/,
    invalidID: "ERC721: invalid token ID",
    mintDuplicate: "ERC721: token already minted",
    transferConflict: "ERC721: transfer from incorrect owner",
    transferForbidden: "ERC721: caller is not token owner or approved",
    approveForbidden: "ERC721: approve caller is not token owner or approved for all",
    approveConflict: "ERC721: approval to current owner",
    noReceiver: "ERC721: transfer to non ERC721Receiver implementer",
    paused: "ERC721Pausable: token transfer while paused",
  },
  ERC1155: {
    invalidRequest:
      /^ERC1155: (address zero is not a valid owner|accounts and ids length mismatch|transfer to the zero address|ids and amounts length mismatch|mint to the zero address|burn from the zero address|setting approval status for self)$/,
    transferForbidden: "ERC1155: caller is not token owner or approved",
    transferNoFund: "ERC1155: insufficient balance for transfer",
    burnNoFund: "ERC1155: burn amount exceeds balance",
    noReceiver: "ERC1155: transfer to non-ERC1155Receiver implementer",
    receiverRejected: "ERC1155: ERC1155Receiver rejected tokens",
    paused: "ERC1155Pausable: token transfer while paused",
  },
  Initializable: {
    alreadyInitialized: /^Initializable: (contract is already initialized)/,
    notInitializing: /^Initializable: (contract is not initializing)/,
  },
  Ownable: {
    notOwner: /^Ownable: (caller is not the owner)/,
  },
  Pausable: {
    paused: /^Pausable: (paused)/,
    notPaused: /^Pausable: (not paused)/,
  },
  SelfCallUpgradeable: {
    forbidden: /^SelfCallUpgradeable\/forbidden: (caller is not this contract)/,
  },
  NextOwnable: {
    executorForbidden: /^NextOwnable\/executorForbidden: (account is neither the owner nor an executor)/,
  },
  CreatorFactory: {
    invalidCreatorId: /^CreatorFactory\/invalidCreatorId: (given a non-existent id)/,
    invalidDAppId: /^CreatorFactory\/invalidDAppId: (given a non-existent id)/,
    invalidCreatorAddress: /^CreatorFactory\/invalidCreatorAddress: (given a non-existent address)/,
    invalidDAppAddress: /^CreatorFactory\/invalidDAppAddress: (given a non-existent address)/,
    inactiveDApp: /^CreatorFactory\/inactiveDApp: (given an inactive id)/,
    invalidLength: /^CreatorFactory\/invalidLength: (given arrays have different lengths)/,
    invalidAmount: /^CreatorFactory\/invalidAmount: (failed to allocate NXPC)/,
    validAddress: /^CreatorFactory\/validAddress/,
  },
  CreatorWalletLogicUpgradeable: {
    inactiveDApp: /^CreatorWalletLogicUpgradeable\/inactiveDApp: (given an inactive id)/,
    forbidden:
      /^CreatorWalletLogicUpgradeable\/forbidden: (The dApp is not owned by the creator|sender is not the creatorFactory nor the owned DApp)/,
    invalidLength: /^CreatorWalletLogicUpgradeable\/invalidLength: (length of to and tokenIds must be same)/,
    invalidAmount: /^CreatorWalletLogicUpgradeable\/invalidAmount: (failed to transfer NXPC)/,
    validAddress: /^CreatorWalletLogicUpgradeable\/validAddress: (couldn't be zero address)/,
  },
  CreatorTokenControllerUpgradeable: {
    notEnoughFund: /^CreatorTokenControllerUpgradeable\/notEnoughFund: (too large amount was requested)/,
  },
  CreatorWallet: {
    invalidTo: /^CreatorWallet\/invalidTo: (to address must be a self)/,
    validAddress: /^CreatorWallet: (couldn't be zero address)/,
  },
  Commission: {
    insufficientBalance: /^Commission: (insufficient balance)/,
    validAddress: /^Commission: (couldn't be zero address)/,
    insufficientFund: /^Commission:/,
  },
  CommissionForCreator: {
    invalidRequest:
      /^CommissionForCreator\/invalidRequest: (address zero is not a valid commission|address zero is not a valid token)/,
  },
  VRFManager: {
    requesterForbidden: /^VRFManager\/requesterForbidden: (caller is not the requester)/,
    invalidRequestId:
      /^VRFManager\/invalidRequestId: (VRF request is alive|VRF request doesn't have deadline|VRF request expired)/,
    invalidRequesterAddress:
      /^VRFManager\/invalidRequesterAddress: (VRF Requester is already added|VRF Requester is not exist)/,
  },
  VRFRequester: {
    managerForbidden: /^VRFRequester\/managerForbidden: (caller is not the VRF manager)/,
  },
  Address: {
    insufficientBalance: /^Address: (insufficient balance)/,
  },
  NXPCDistributor: {
    invalidRound:
      /^NXPCDistributor\/invalidRound: (round must be greater than or equal to current round|round must be ended)/,
    alreadyEnded: /^NXPCDistributor\/alreadyEnded: (round must be started)/,
    invalidProof: /^NXPCDistributor\/invalidProof: (basket merkle root is different|reward merkle root is different)/,
    invalidInputLength: /^NXPCDistributor\/invalidInputLength: (all input arrays must have the same length)/,
    invalidDepositor: /^NXPCDistributor\/invalidDepositor: (user is not a depositor)/,
    notClaimable: /^NXPCDistributor\/notClaimable: (reward has not been registered)/,
    invalidLength: /^NXPCDistributor\/invalidLength: (length must be bigger than 0)/,
    invalidMerkleRoot:
      /^NXPCDistributor\/invalidMerkleRoot: (merkle root must not be zero bytes|basket merkle root has not been set)/,
    invalidAddress: /^NXPCDistributor\/invalidAddress:/,
    alreadyStarted: /^NXPCDistributor\/alreadyStarted: (round must be ended)/,
    alreadyClaimed: /^NXPCDistributor\/alreadyClaimed: (merkle leaf is already used)/,
    transferFailed: /^NXPCDistributor\/transferFailed: (NXPC transfer failed)/,
    invalidSlot: /^NXPCDistributor\/invalidSlot: (current item's slot is full)/,
    invalidBasket: /^NXPCDistributor\/invalidBasket: (basket isn't full)/,
  },
  NXPCAmountManager: {
    notAllowlisted: /^NXPCAmountManager\/notAllowlisted: (msg sender is not allowlisted)/,
    invalidAmount: /^NXPCAmountManager\/invalidAmount: (accumulated minted amount exceeds the burned amount)/,
  },
  DestinationBridge: {
    blocklist: /^DestinationBridge\/blocklist:/,
    invalidRequest: /^DestinationBridge\/invalidRequest:/,
    invalidAddress: /^DestinationBridge\/invalidAddress:/,
    overBlockGas: /^DestinationBridge\/overBlockGas:/,
  },
  SourceBridge: {
    blocklist: /^SourceBridge\/blocklist:/,
    invalidRequest: /^SourceBridge\/invalidRequest:/,
    invalidAddress: /^SourceBridge\/invalidAddress:/,
    wrongAmount: /^SourceBridge\/wrongAmount:/,
    wrongValue: /^SourceBridge\/wrongValue:/,
    wrongLength: /^SourceBridge\/wrongLength:/,
    transferFailed: /^SourceBridge\/transferFailed:/,
    overBlockGas: /^SourceBridge\/overBlockGas:/,
  },
  Teller: {
    invalidRequest: /^Teller\/invalidRequest:/,
    transferFailed: /^Teller\/transferFailed:/,
    wrongValue: /^Teller\/wrongValue:/,
    invalidSignature: /^Teller\/invalidSignature:/,
    invalidOrderHash: /^Teller\/invalidOrderHash:/,
    wrongLength: /^Teller\/wrongLength:/,
  },
  NXPCClaim: {
    invalidRequest: /^NXPCClaim\/invalidRequest:/,
    timeout: /^NXPCClaim\/timeout:/,
    transferFailed: /^NXPCClaim\/transferFailed:/,
  },
  ItemIssuance: {
    invalidAmount: /^ItemIssuance\/invalidAmount:/,
    invalidStatus: /^ItemIssuance\/invalidStatus:/,
    invalidRequest: /^ItemIssuance\/invalidRequest:/,
    invalidAddress: /^ItemIssuance\/invalidAddress:/,
    invalidUniverse: /^ItemIssuance\/invalidUniverse:/,
  },
};
