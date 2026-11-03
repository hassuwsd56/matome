// 種類の登録。ここに並べた順が、入力画面の切り替えボタンやカレンダーでの並び順になる。
import { registerType } from './registry.js';
import event from './event.js';
import task from './task.js';
import memo from './memo.js';

[event, task, memo].forEach(registerType);
