import { Request, Response } from 'express';
import { ItemService } from '@/services/ItemService';
import { ApiResponse } from '@/types';
import logger from '@/utils/logger';

export class ItemController {
    constructor(private itemService: ItemService) { }

    /**
     * Get all available items
     */
    getAllItems = async (req: Request, res: Response): Promise<void> => {
        try {
            const items = await this.itemService.getAllItems();

            const response: ApiResponse = {
                success: true,
                data: items,
            };

            res.json(response);
        } catch (error) {
            logger.error('Error in getAllItems controller:', error);
            this.handleError(error, res);
        }
    };

    /**
     * Get user's loadout
     */
    getUserLoadout = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const loadout = await this.itemService.getUserLoadout(id);

            const response: ApiResponse = {
                success: true,
                data: loadout,
            };

            res.json(response);
        } catch (error) {
            logger.error('Error in getUserLoadout controller:', error);
            this.handleError(error, res);
        }
    };

    /**
     * Get available items for user
     */
    getAvailableItems = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const items = await this.itemService.getAvailableItems(id);

            const response: ApiResponse = {
                success: true,
                data: items,
            };

            res.json(response);
        } catch (error) {
            logger.error('Error in getAvailableItems controller:', error);
            this.handleError(error, res);
        }
    };

    /**
     * Get active buffs for user
     */
    getActiveBuffs = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const buffs = await this.itemService.getActiveBuffs(id);

            const response: ApiResponse = {
                success: true,
                data: buffs,
            };

            res.json(response);
        } catch (error) {
            logger.error('Error in getActiveBuffs controller:', error);
            this.handleError(error, res);
        }
    };

    /**
     * Equip item
     */
    equipItem = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params; // userId
            const { itemId, slot } = req.body;

            if (!itemId) {
                const response: ApiResponse = {
                    success: false,
                    error: 'itemId is required',
                };
                res.status(400).json(response);
                return;
            }

            const loadout = await this.itemService.equipItem(id, itemId, slot);

            const response: ApiResponse = {
                success: true,
                data: loadout,
                message: 'Item equipped successfully',
            };

            res.json(response);
        } catch (error) {
            logger.error('Error in equipItem controller:', error);
            this.handleError(error, res);
        }
    };

    /**
     * Unequip item
     */
    unequipItem = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params; // userId
            const { itemId } = req.body;

            if (!itemId) {
                const response: ApiResponse = {
                    success: false,
                    error: 'itemId is required',
                };
                res.status(400).json(response);
                return;
            }

            await this.itemService.unequipItem(id, itemId);

            const response: ApiResponse = {
                success: true,
                message: 'Item unequipped successfully',
            };

            res.json(response);
        } catch (error) {
            logger.error('Error in unequipItem controller:', error);
            this.handleError(error, res);
        }
    };

    /**
     * Initialize default items (admin only)
     */
    initializeItems = async (req: Request, res: Response): Promise<void> => {
        try {
            await this.itemService.initializeDefaultItems();

            const response: ApiResponse = {
                success: true,
                message: 'Default items initialized successfully',
            };

            res.json(response);
        } catch (error) {
            logger.error('Error in initializeItems controller:', error);
            this.handleError(error, res);
        }
    };

    /**
     * Handle errors
     */
    private handleError(error: any, res: Response): void {
        if (error.statusCode) {
            const response: ApiResponse = {
                success: false,
                error: error.message,
            };
            res.status(error.statusCode).json(response);
        } else {
            const response: ApiResponse = {
                success: false,
                error: 'Internal server error',
            };
            res.status(500).json(response);
        }
    }
}

