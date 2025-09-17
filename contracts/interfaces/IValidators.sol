// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/**
 * @title IValidators Interface
 * @dev Interface for Validators contract to break circular dependency
 */
interface IValidators {
    function slashValidator(address validator) external;
    function isValidatorActivated(address validator) external view returns (bool);
    function isJailed(address validator) external view returns (bool);
}
