import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { Shift } from './entities/shift.entity';
import { ShiftActivity } from './entities/shift-activity.entity';
import { WatchListItem } from './entities/watch-list-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Shift, ShiftActivity, WatchListItem])],
  controllers: [ShiftsController],
  providers: [ShiftsService],
})
export class ShiftsModule {}
