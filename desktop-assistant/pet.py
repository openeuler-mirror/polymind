import sys
import time
import random
import subprocess

from PyQt5.QtCore import Qt, QTimer, QObject, QPoint
from PyQt5.QtGui import QImage, QPixmap, QIcon, QCursor, QPainter, QPainterPath, QBitmap
from PyQt5.QtWidgets import *
from typing import List

from utils import *
from conf import *

# 特殊角色常量定义
SPECIAL_PET_NAME = "小智"

class PetWidget(QWidget):
    def __init__(self, parent=None, curr_pet_name='', pets=()):
        """
        宠物组件
        :param parent: 父窗口
        :param curr_pet_name: 当前宠物名称
        :param pets: 全部宠物列表
        """
        super(PetWidget, self).__init__(parent, flags=Qt.WindowFlags())
        self.curr_pet_name = ''
        self.pet_conf = PetConfig()
        self.image = None
        self.label = QLabel(self)
        # 鼠标拖拽初始属性
        self.is_follow_mouse = False
        self.mouse_drag_pos = self.pos()
        # 是否在执行动画
        self.is_run_act = False
        # 动画状态管理
        self.current_acts = []  # 待执行的动作列表
        self.current_act_index = 0  # 当前执行的动作索引
        self.current_frame_index = 0  # 当前帧索引
        self.current_act_repeats = 0  # 当前动作剩余重复次数
        self.animation_timer = QTimer(self)  # 动画定时器
        self.animation_timer.timeout.connect(self._update_animation)

        self._init_widget()
        self.init_conf(curr_pet_name if curr_pet_name else pets[0])
        self._set_menu(pets)
        self._set_tray()
        self.show()

        # 每5秒执行随机执行一个动作
        self.random_act_timer = QTimer()
        self.random_act_timer.timeout.connect(self.random_act)
        self.random_act_timer.start(self.pet_conf.refresh)
        
        # 单击事件位置跟踪
        self.mouse_press_pos = None
        self.pending_act = None
        self.is_processing = False

    def mousePressEvent(self, event):
        """
        鼠标点击事件
        :param event: 事件
        :return:
        """
        if event.button() == Qt.RightButton:
            # 打开右键菜单
            self.setContextMenuPolicy(Qt.CustomContextMenu)
            self.customContextMenuRequested.connect(self._show_right_menu)
        if event.button() == Qt.LeftButton:
            # 左键绑定拖拽
            self.is_follow_mouse = True
            self.mouse_drag_pos = event.globalPos() - self.pos()
            # 记录鼠标按下时的位置（用于单击判断）
            self.mouse_press_pos = event.globalPos()
            event.accept()
            self.setCursor(QCursor(Qt.ArrowCursor))

    def mouseMoveEvent(self, event):
        """
        鼠标移动事件, 左键且绑定跟随, 移动窗体
        :param event:
        :return:
        """
        if Qt.LeftButton and self.is_follow_mouse:
            self.move(event.globalPos() - self.mouse_drag_pos)
            event.accept()

    def mouseReleaseEvent(self, event):
        """
        松开鼠标操作
        :param event:
        :return:
        """
        self.is_follow_mouse = False
        self.setCursor(QCursor(Qt.ArrowCursor))
        
        # 处理单击事件（位置未变化时）
        if (event.button() == Qt.LeftButton and
            self.mouse_press_pos and
            self.curr_pet_name == SPECIAL_PET_NAME):
            # 计算位置变化（欧几里得距离）
            move_distance = ((event.globalPos() - self.mouse_press_pos).manhattanLength())
            # 如果移动距离小于5像素，视为单击
            if move_distance < 5:
                self._handle_single_click()
        self.mouse_press_pos = None

    def enterEvent(self, event):
        """
        鼠标进入事件，播放打招呼动画
        :param event:
        :return:
        """
        if self.curr_pet_name == SPECIAL_PET_NAME:
            # 使用default动作
            if self.is_run_act or self.is_processing:
                self.pending_act = "default"
            else:
                # 没有动作执行，直接播放打招呼动作
                self.play_specific_act("default")
                

    def _init_widget(self) -> None:
        self.setWindowFlags(
            Qt.FramelessWindowHint |
            Qt.WindowStaysOnTopHint |
            Qt.SubWindow |
            Qt.NoDropShadowWindowHint |
            Qt.X11BypassWindowManagerHint
        )
        
        self.setAttribute(Qt.WA_TranslucentBackground, True)
        self.setAttribute(Qt.WA_NoSystemBackground, True)
        self.setAttribute(Qt.WA_OpaquePaintEvent, False)  # 关键：禁用不透明绘制
        
        self.setContentsMargins(0, 0, 0, 0)
        self.layout().setContentsMargins(0, 0, 0, 0) if self.layout() else None
        
        self.is_follow_mouse = False
        self.mouse_drag_pos = self.pos()
        self.resize(self.pet_conf.size, self.pet_conf.size)
        
        self.repaint()

    def _init_img(self, img: QImage) -> None:
        """
        初始化窗体图片
        :param img:
        :return:
        """
        self.set_img(img)
        self.resize(self.pet_conf.size, self.pet_conf.size)
        self.show()

    def _set_menu(self, pets=()):
        """
        初始化菜单
        """
        menu = QMenu(self)

        # 切换角色子菜单
        change_menu = QMenu(menu)
        change_menu.setTitle('切换角色')
        change_acts = [_build_change_act(name, change_menu, self._change_pet) for name in pets]
        change_menu.addActions(change_acts)
        menu.addMenu(change_menu)

        # 退出动作
        quit_act = QAction('退出', menu)
        quit_act.triggered.connect(self.quit)
        menu.addAction(quit_act)
        self.menu = menu

    def _show_right_menu(self):
        """
        展示右键菜单
        :return:
        """
        # 光标位置弹出菜单
        self.menu.popup(QCursor.pos())

    def _change_pet(self, pet_name: str) -> None:
        """
        改变宠物
        :param pet_name: 宠物名称
        :return:
        """
        self.init_conf(pet_name)
        self.set_img(self.image)
        self.repaint()

    def init_conf(self, pet_name: str) -> None:
        """
        初始化宠物窗口配置
        :param pet_name: 宠物名称
        :return:
        """
        self.curr_pet_name = pet_name
        pic_dict = _load_all_pic(pet_name)
        self.pet_conf = PetConfig.init_config(self.curr_pet_name, pic_dict)
        self.set_img(list(pic_dict.values())[0])
        if self.curr_pet_name == SPECIAL_PET_NAME:
            self.update_mask()
            # 加载AppImage路径
            try:
                with open(f'res/role/{pet_name}/pet_conf.json', 'r') as f:
                    conf = json.load(f)
                    self.app_image_path = conf.get('app_image_path', '')
            except:
                self.app_image_path = ''

    def _set_tray(self) -> None:
        """
        设置最小化托盘
        :return:
        """
        tray = QSystemTrayIcon(self)
        tray.setIcon(QIcon('res/icon.png'))
        tray.setContextMenu(self.menu)
        tray.show()
    
    def update_mask(self):
        """创建圆形窗口遮罩"""
        diameter = min(self.width(), self.height())
        mask = QBitmap(diameter, diameter)
        mask.fill(Qt.color0)
        
        painter = QPainter(mask)
        painter.setRenderHint(QPainter.Antialiasing)
        painter.setBrush(Qt.color1)
        painter.drawEllipse(0, 0, diameter, diameter)
        painter.end()
        
        self.setMask(mask)

    def set_img(self, img: QImage) -> None:
        """
        为窗体设置图片
        :param img: 图片
        :return:
        """
        pixmap = QPixmap.fromImage(img)

        if self.curr_pet_name == SPECIAL_PET_NAME:
            # 创建相同大小的透明pixmap
            rounded = QPixmap(pixmap.size())
            rounded.fill(Qt.transparent)
            
            # 创建圆形绘制路径
            painter = QPainter(rounded)
            painter.setRenderHint(QPainter.Antialiasing)
            path = QPainterPath()
            diameter = min(pixmap.width(), pixmap.height())
            path.addEllipse(0, 0, diameter, diameter)
            painter.setClipPath(path)
            
            # 绘制原始图像
            painter.drawPixmap(0, 0, pixmap)
            painter.end()
            
            pixmap = rounded
        self.label.setPixmap(pixmap)
        self.image = img

        if self.curr_pet_name == SPECIAL_PET_NAME:
            self.update_mask()

    def play_specific_act(self, act_id: str) -> None:
        """
        播放指定动作
        :param act_id: 动作ID
        :return:
        """
        if self.is_run_act:
            # 如果已经有动作在执行，设置待执行动
            self.pending_act = act_id
            return

        # 从所有动作中查找指定动作
        if hasattr(self.pet_conf, 'all_acts') and act_id in self.pet_conf.all_acts:
            act = self.pet_conf.all_acts[act_id]
            self.is_run_act = True
            # 创建只包含该动作的序列
            self.current_acts = [act]  # 修复：使用一维列表而不是二维列表
            self.current_act_index = 0
            self.current_frame_index = 0
            self._start_next_act()
                
    def random_act(self) -> None:
        """
        随机执行动作
        :return:
        """
        if self.is_run_act or self.is_processing:
            return

        self.is_run_act = True
        # 选取随机动作执行
        self.current_acts = random.choice(self.pet_conf.random_act)
        self.current_act_index = 0
        self.current_frame_index = 0
        # 开始动画序列
        self._start_next_act()

    def _start_next_act(self) -> None:
        """
        开始执行下一个动作
        """
        if self.current_act_index >= len(self.current_acts):
            # 所有动作执行完成
            self.is_run_act = False
            return
        
        act = self.current_acts[self.current_act_index]
        self.current_frame_index = 0
        self.current_act_repeats = act.act_num
        # 设置定时器间隔（毫秒）
        interval = int(act.frame_refresh * 1000)
        self.animation_timer.start(interval)

    def _update_animation(self) -> None:
        """
        定时器回调：更新动画帧
        """
        if not self.is_run_act or self.current_act_index >= len(self.current_acts):
            self.animation_timer.stop()
            return
            
        
        act = self.current_acts[self.current_act_index]
        
        # 更新当前帧
        img = act.images[self.current_frame_index]
        self.set_img(img)
        
        # 执行移动（如果需要）
        if act.need_move:
            self._move(self.pos(), act)
        else:
            self._static_act(self.pos())
            
        self.repaint()
        
        # 更新帧索引
        self.current_frame_index += 1
        
        # 检查是否需要切换到下一帧或下一个动作
        if self.current_frame_index >= len(act.images):
            # 完成一轮动画
            self.current_frame_index = 0
            self.current_act_repeats -= 1
            # 检查当前动作是否完成
            if self.current_act_repeats <= 0:
                # 当前动作完成，切换到下一个动作
                self.current_act_index += 1
                self.animation_timer.stop()

                self.is_processing = True

                if self.pending_act:
                    next_act = self.pending_act
                    self.pending_act = None
                    self.is_run_act = False
                    self.play_specific_act(next_act)
                    self.is_processing = False
                else:
                    # 没有待执行动作，标记动作执行结束
                    self.is_run_act = False
                    self._start_next_act()
                    self.is_processing = False

    def _static_act(self, pos: QPoint) -> None:
        """
        静态动作判断位置
        :param pos: 位置
        :return:
        """
        screen_geo = QDesktopWidget().screenGeometry()
        screen_width = screen_geo.width()
        screen_height = screen_geo.height()
        border = self.pet_conf.size
        new_x = pos.x()
        new_y = pos.y()
        if pos.x() < border:
            new_x = screen_width - border
        elif pos.x() > screen_width - border:
            new_x = border
        if pos.y() < border:
            new_y = screen_height - border
        elif pos.y() > screen_height - border:
            new_y = border
        self.move(new_x, new_y)

    def _move(self, pos: QPoint, act: QAction) -> None:
        """
        移动动作
        :param pos: 当前位置
        :param act: 动作
        :return
        """
        screen_geo = QDesktopWidget().screenGeometry()
        screen_width = screen_geo.width()
        screen_height = screen_geo.height()
        border = self.pet_conf.size
        if act.direction == 'right':
            new_x = pos.x() + act.frame_move
            if new_x < screen_width - border:
                self.move(new_x, pos.y())
            else:
                self.move(border, pos.y())
        if act.direction == 'left':
            new_x = pos.x() - act.frame_move
            if new_x > border:
                self.move(new_x, pos.y())
            else:
                self.move(screen_width - border, pos.y())
        if act.direction == 'up':
            new_y = pos.y() - act.frame_move
            if new_y > border:
                self.move(pos.x(), new_y)
            else:
                self.move(pos.x(), screen_height - border)
        if act.direction == 'down':
            new_y = pos.y() + act.frame_move
            if new_y < screen_height - border:
                self.move(pos.x(), new_y)
            else:
                self.move(pos.x(), border)
        if act.direction == 'left_down':
            new_y = pos.y() + act.frame_move
            new_x = pos.x() - act.frame_move
            if new_x > border and new_y < screen_height - border:
                self.move(new_x, new_y)
            else:
                self.move(screen_width - border, border)

    def _handle_single_click(self):
        """
        处理单击事件：打开/最小化/最大化应用
        """
        try:
            # 查找应用窗口ID
            result = subprocess.run(
                ['xdotool', 'search', '--name', 'DeepChat - Shell'],
                capture_output=True,
                text=True
            )
            
            window_ids = result.stdout.strip().split()
            
            if window_ids:
                # 过滤出有效的窗口ID
                valid_window_ids = []
                for window_id in window_ids:
                    if self._is_window_valid(window_id):
                        valid_window_ids.append(window_id)

                if valid_window_ids:
                    window_id = valid_window_ids[0]
                    self._toggle_window_state(window_id)
                else:
                    # 所有找到的窗口都无效，启动新应用
                    if hasattr(self, 'app_image_path') and self.app_image_path:
                        self._launch_and_activate_app()
            else:
                # 应用未打开，启动应用
                if hasattr(self, 'app_image_path') and self.app_image_path:
                    self._launch_and_activate_app()
        except Exception as e:
            # 尝试直接启动应用作为后备方案
            if hasattr(self, 'app_image_path') and self.app_image_path:
                subprocess.Popen([self.app_image_path])
    
    def _toggle_window_state(self, window_id):
        """
        切换窗口状态（最大化/最小化）
        """
        try:
            # 首先验证窗口是否仍然存在且有效
            if not self._is_window_valid(window_id):
                if hasattr(self, 'app_image_path') and self.app_image_path:
                    self._launch_and_activate_app()
                return
            
            # 使用 xprop 检查窗口状态
            xprop_result = subprocess.run(
                ['xprop', '-id', window_id],
                capture_output=True,
                text=True
            )
            xprop_output = xprop_result.stdout
            
            # 检查窗口是否最小化
            is_minimized = '_NET_WM_STATE_HIDDEN' in xprop_output
            
            if is_minimized:
                subprocess.run(['xdotool', 'windowactivate', window_id])
            else:
                subprocess.run(['xdotool', 'windowminimize', window_id])
        except Exception as e:
            # 如果出错，尝试启动新应用
            if hasattr(self, 'app_image_path') and self.app_image_path:
                self._launch_and_activate_app()
    
    def _is_window_valid(self, window_id):
        """
        检查窗口ID是否仍然有效
        """
        try:
            # 首先尝试使用 xdotool 检查窗口是否仍然存在
            xdotool_result = subprocess.run(
                ['xdotool', 'getwindowname', window_id],
                capture_output=True,
                text=True
            )
            
            if xdotool_result.returncode != 0:
                return False
            
            # 使用 xwininfo 检查窗口是否存在
            result = subprocess.run(
                ['xwininfo', '-id', window_id],
                capture_output=True,
                text=True
            )
            
            # 如果命令成功执行且输出包含窗口信息，说明窗口存在
            if result.returncode == 0 and 'Window id:' in result.stdout:
                # 检查窗口是否可见（通过检查窗口的几何信息）
                if '0x0' in result.stdout or '1x1' in result.stdout:
                    return False
                
                # 检查窗口的映射状态
                if 'Map State: IsUnMapped' in result.stdout:
                    return False
                
                # 进一步检查窗口是否可见
                xprop_result = subprocess.run(
                    ['xprop', '-id', window_id, '_NET_WM_STATE'],
                    capture_output=True,
                    text=True
                )
                
                if xprop_result.returncode == 0:
                    # 检查窗口是否被隐藏或关闭
                    if '_NET_WM_STATE_HIDDEN' in xprop_result.stdout:
                        return True  # 最小化的窗口仍然有效
                    elif '_NET_WM_STATE_WITHDRAWN' in xprop_result.stdout:
                        return False  # 被撤销的窗口无效
                    else:
                        return True  # 正常显示的窗口
                else:
                    # 无法获取 _NET_WM_STATE 属性，可能是窗口已关闭
                    return False
            else:
                return False
        except Exception as e:
            return False
    
    def _launch_and_activate_app(self):
        """
        启动应用并确保窗口正常显示
        """
        # 启动应用
        subprocess.Popen([self.app_image_path])
        

    def quit(self) -> None:
        """
        关闭窗口, 系统退出
        :return:
        """
        self.close()
        sys.exit()


def _load_all_pic(pet_name: str) -> dict:
    """
    加载宠物所有动作图片
    :param pet_name: 宠物名称
    :return: {动作编码: 动作图片}
    """
    img_dir = 'res/role/{}/action/'.format(pet_name)
    images = os.listdir(img_dir)
    return {image.split('.')[0]: _get_q_img(img_dir + image) for image in images}


def _build_change_act(pet_name: str, parent: QObject, act_func) -> QAction:
    """
    构建改变菜单动作
    :param pet_name: 菜单动作名称
    :param parent 父级菜单
    :param act_func: 菜单动作函数
    :return:
    """
    act = QAction(pet_name, parent)
    act.triggered.connect(lambda: act_func(pet_name))
    return act


def _get_q_img(img_path: str) -> QImage:
    """
    将图片路径加载为 QImage
    :param img_path: 图片路径
    :return: QImage
    """
    image = QImage()
    image.load(img_path)
    return image
