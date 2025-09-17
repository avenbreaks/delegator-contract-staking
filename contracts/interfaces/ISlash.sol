// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/**
 * @title ISlash Interface
 * @dev Interface for Slash contract to break circular dependency
 */
interface ISlash {
    function clean(address validator) external returns (bool);
    function getSlashRecord(address validator) external view returns (uint256);
}
