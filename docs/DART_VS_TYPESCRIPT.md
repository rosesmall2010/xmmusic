# Dart vs TypeScript 语言对比

**文档版本**: 1.0
**创建日期**: 2025-01-27
**适用场景**: 移动端开发技术选型参考

---

## 📋 快速对比总览

| 特性 | Dart | TypeScript |
|------|------|------------|
| **类型系统** | 强类型，可选 null-safety | 渐进式类型，可选严格模式 |
| **编译方式** | AOT/JIT 编译 | 编译到 JavaScript |
| **空安全** | 内置 null-safety | 可选 strictNullChecks |
| **异步模型** | async/await + Future/Stream | async/await + Promise |
| **学习曲线** | 中等（新语言） | 低（基于 JavaScript） |
| **生态成熟度** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **包管理** | pub.dev | npm |
| **主要用途** | Flutter 开发 | Web/Node.js/React/Vue 等 |

---

## 🔤 语法对比

### 1. 基础类型定义

#### Dart
```dart
// 基础类型
int age = 25;
double price = 99.99;
String name = "John";
bool isActive = true;

// 列表和映射
List<String> fruits = ['apple', 'banana'];
Map<String, int> scores = {'math': 95, 'english': 88};

// 动态类型（不推荐）
dynamic value = "anything";
```

#### TypeScript
```typescript
// 基础类型
let age: number = 25;
let price: number = 99.99;
let name: string = "John";
let isActive: boolean = true;

// 数组和对象
let fruits: string[] = ['apple', 'banana'];
let scores: Record<string, number> = { math: 95, english: 88 };

// 类型推断（推荐）
let age = 25; // 自动推断为 number
let fruits = ['apple', 'banana']; // 自动推断为 string[]
```

**对比**:
- Dart: 类型在前，更明确
- TypeScript: 类型在后，更灵活，支持类型推断

---

### 2. 空安全（Null Safety）

#### Dart（内置 null-safety）
```dart
// Dart 2.12+ 默认启用 null-safety
String? nullableName; // 可空类型
String nonNullableName = "John"; // 非空类型

// 空检查
if (nullableName != null) {
  print(nullableName.length); // 自动提升为非空
}

// 空合并操作符
String name = nullableName ?? "Unknown";

// 空安全调用
int? length = nullableName?.length;
```

#### TypeScript（可选 strictNullChecks）
```typescript
// 需要开启 strictNullChecks
let nullableName: string | null = null;
let nonNullableName: string = "John";

// 类型守卫
if (nullableName !== null) {
  console.log(nullableName.length); // 类型收窄
}

// 空合并操作符
let name = nullableName ?? "Unknown";

// 可选链
let length = nullableName?.length;
```

**对比**:
- Dart: 默认启用 null-safety，更安全
- TypeScript: 需要手动开启，但更灵活

---

### 3. 类和对象

#### Dart
```dart
class Person {
  String name;
  int age;

  // 构造函数
  Person(this.name, this.age);

  // 命名构造函数
  Person.fromJson(Map<String, dynamic> json)
      : name = json['name'],
        age = json['age'];

  // 方法
  void introduce() {
    print('I am $name, $age years old');
  }

  // Getter/Setter
  String get info => '$name ($age)';
  set age(int newAge) {
    if (newAge > 0) age = newAge;
  }
}

// 使用
var person = Person('John', 25);
person.introduce();
```

#### TypeScript
```typescript
class Person {
  name: string;
  age: number;

  // 构造函数
  constructor(name: string, age: number) {
    this.name = name;
    this.age = age;
  }

  // 静态方法
  static fromJson(json: { name: string; age: number }): Person {
    return new Person(json.name, json.age);
  }

  // 方法
  introduce(): void {
    console.log(`I am ${this.name}, ${this.age} years old`);
  }

  // Getter/Setter
  get info(): string {
    return `${this.name} (${this.age})`;
  }

  set age(newAge: number) {
    if (newAge > 0) this.age = newAge;
  }
}

// 使用
const person = new Person('John', 25);
person.introduce();
```

**对比**:
- Dart: 语法更简洁，`this.` 可省略
- TypeScript: 更接近传统 OOP，需要 `this.`

---

### 4. 异步编程

#### Dart
```dart
// Future（类似 Promise）
Future<String> fetchData() async {
  await Future.delayed(Duration(seconds: 1));
  return "Data loaded";
}

// 使用
fetchData().then((data) => print(data));

// 或使用 async/await
void main() async {
  String data = await fetchData();
  print(data);
}

// Stream（类似 Observable）
Stream<int> countStream() async* {
  for (int i = 1; i <= 5; i++) {
    await Future.delayed(Duration(seconds: 1));
    yield i;
  }
}

// 使用 Stream
countStream().listen((count) => print(count));
```

#### TypeScript
```typescript
// Promise
async function fetchData(): Promise<string> {
  await new Promise(resolve => setTimeout(resolve, 1000));
  return "Data loaded";
}

// 使用
fetchData().then(data => console.log(data));

// 或使用 async/await
async function main() {
  const data = await fetchData();
  console.log(data);
}

// Observable（需要 RxJS）
import { Observable } from 'rxjs';

function countStream(): Observable<number> {
  return new Observable(observer => {
    let count = 1;
    const interval = setInterval(() => {
      observer.next(count++);
      if (count > 5) {
        clearInterval(interval);
        observer.complete();
      }
    }, 1000);
  });
}
```

**对比**:
- Dart: Future 和 Stream 是内置的，更统一
- TypeScript: Promise 内置，Stream 需要 RxJS 库

---

### 5. 函数式编程

#### Dart
```dart
// 函数作为一等公民
int Function(int, int) add = (a, b) => a + b;

// 高阶函数
List<int> numbers = [1, 2, 3, 4, 5];
List<int> doubled = numbers.map((n) => n * 2).toList();
List<int> evens = numbers.where((n) => n % 2 == 0).toList();

// 扩展方法（类似扩展函数）
extension StringExtension on String {
  String capitalize() {
    return '${this[0].toUpperCase()}${this.substring(1)}';
  }
}

// 使用
String name = "john".capitalize(); // "John"
```

#### TypeScript
```typescript
// 函数作为一等公民
const add = (a: number, b: number): number => a + b;

// 高阶函数
const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(n => n * 2);
const evens = numbers.filter(n => n % 2 === 0);

// 类型扩展（需要声明合并）
interface String {
  capitalize(): string;
}

String.prototype.capitalize = function() {
  return this.charAt(0).toUpperCase() + this.slice(1);
};

// 使用
const name = "john".capitalize(); // "John"
```

**对比**:
- Dart: 扩展方法更优雅
- TypeScript: 更灵活，但扩展需要声明合并

---

### 6. 泛型

#### Dart
```dart
// 泛型类
class Box<T> {
  T value;
  Box(this.value);

  T getValue() => value;
}

// 泛型函数
T first<T>(List<T> list) => list.first;

// 使用
var intBox = Box<int>(42);
var stringBox = Box<String>("Hello");
var firstNumber = first<int>([1, 2, 3]);
```

#### TypeScript
```typescript
// 泛型类
class Box<T> {
  value: T;

  constructor(value: T) {
    this.value = value;
  }

  getValue(): T {
    return this.value;
  }
}

// 泛型函数
function first<T>(list: T[]): T {
  return list[0];
}

// 使用
const intBox = new Box<number>(42);
const stringBox = new Box<string>("Hello");
const firstNumber = first<number>([1, 2, 3]);
```

**对比**: 两者泛型语法相似，功能接近

---

### 7. 枚举

#### Dart
```dart
// 简单枚举
enum Color { red, green, blue }

// 增强枚举（Dart 2.17+）
enum Status {
  pending('等待中'),
  processing('处理中'),
  completed('已完成');

  final String label;
  const Status(this.label);
}

// 使用
Color color = Color.red;
Status status = Status.pending;
print(status.label); // "等待中"
```

#### TypeScript
```typescript
// 数字枚举
enum Color {
  Red,
  Green,
  Blue
}

// 字符串枚举
enum Status {
  Pending = '等待中',
  Processing = '处理中',
  Completed = '已完成'
}

// 使用
const color = Color.Red;
const status = Status.Pending;
console.log(status); // "等待中"
```

**对比**:
- Dart: 增强枚举更强大
- TypeScript: 枚举更灵活（数字/字符串）

---

### 8. 模式匹配（Pattern Matching）

#### Dart（3.0+）
```dart
// Switch 表达式
String getColorName(Color color) => switch (color) {
  Color.red => '红色',
  Color.green => '绿色',
  Color.blue => '蓝色',
};

// 模式匹配
void handleValue(dynamic value) {
  switch (value) {
    case int n when n > 0:
      print('正数: $n');
    case [String name, int age]:
      print('姓名: $name, 年龄: $age');
    case {'name': String name, 'age': int age}:
      print('对象: $name ($age)');
    default:
      print('未知');
  }
}
```

#### TypeScript（4.9+）
```typescript
// Switch 表达式（需要手动实现）
function getColorName(color: Color): string {
  switch (color) {
    case Color.Red: return '红色';
    case Color.Green: return '绿色';
    case Color.Blue: return '蓝色';
    default: return '未知';
  }
}

// 类型守卫
function handleValue(value: unknown): void {
  if (typeof value === 'number' && value > 0) {
    console.log(`正数: ${value}`);
  } else if (Array.isArray(value) && value.length === 2) {
    const [name, age] = value;
    console.log(`数组: ${name}, ${age}`);
  } else if (value && typeof value === 'object' && 'name' in value) {
    console.log(`对象: ${(value as any).name}`);
  }
}
```

**对比**:
- Dart: 模式匹配更强大和优雅
- TypeScript: 需要手动实现，但类型守卫灵活

---

## 🎯 实际开发场景对比

### 场景 1: 音乐播放器 - 状态管理

#### Dart (Flutter + Provider)
```dart
// 状态类
class PlayerState extends ChangeNotifier {
  MusicItem? _currentMusic;
  bool _isPlaying = false;
  double _volume = 50.0;

  MusicItem? get currentMusic => _currentMusic;
  bool get isPlaying => _isPlaying;
  double get volume => _volume;

  void play(MusicItem music) {
    _currentMusic = music;
    _isPlaying = true;
    notifyListeners();
  }

  void pause() {
    _isPlaying = false;
    notifyListeners();
  }

  void setVolume(double volume) {
    _volume = volume.clamp(0.0, 100.0);
    notifyListeners();
  }
}

// 使用
Consumer<PlayerState>(
  builder: (context, player, child) {
    return Text(player.currentMusic?.title ?? '无');
  },
)
```

#### TypeScript (Vue 3 + Pinia)
```typescript
// Store
import { defineStore } from 'pinia';

export const usePlayerStore = defineStore('player', {
  state: () => ({
    currentMusic: null as MusicItem | null,
    isPlaying: false,
    volume: 50.0,
  }),

  actions: {
    play(music: MusicItem) {
      this.currentMusic = music;
      this.isPlaying = true;
    },

    pause() {
      this.isPlaying = false;
    },

    setVolume(volume: number) {
      this.volume = Math.max(0, Math.min(100, volume));
    },
  },
});

// 使用
const playerStore = usePlayerStore();
const currentTitle = computed(() => playerStore.currentMusic?.title ?? '无');
```

**对比**:
- Dart: 需要手动 `notifyListeners()`
- TypeScript: 自动响应式，更简洁

---

### 场景 2: 异步数据加载

#### Dart
```dart
class MusicService {
  Future<List<MusicItem>> loadMusicList() async {
    try {
      final response = await http.get(Uri.parse('/api/music'));
      final data = jsonDecode(response.body) as List;
      return data.map((item) => MusicItem.fromJson(item)).toList();
    } catch (e) {
      throw Exception('加载失败: $e');
    }
  }
}

// 使用 FutureBuilder
FutureBuilder<List<MusicItem>>(
  future: musicService.loadMusicList(),
  builder: (context, snapshot) {
    if (snapshot.connectionState == ConnectionState.waiting) {
      return CircularProgressIndicator();
    }
    if (snapshot.hasError) {
      return Text('错误: ${snapshot.error}');
    }
    return ListView.builder(
      itemCount: snapshot.data!.length,
      itemBuilder: (context, index) => MusicItemWidget(snapshot.data![index]),
    );
  },
)
```

#### TypeScript
```typescript
class MusicService {
  async loadMusicList(): Promise<MusicItem[]> {
    try {
      const response = await fetch('/api/music');
      const data = await response.json();
      return data.map((item: any) => MusicItem.fromJson(item));
    } catch (e) {
      throw new Error(`加载失败: ${e}`);
    }
  }
}

// 使用 Composition API
const { data, loading, error } = useAsyncData('music-list', () =>
  musicService.loadMusicList()
);

if (loading.value) return <Spinner />;
if (error.value) return <Error message={error.value.message} />;
return <MusicList items={data.value} />;
```

**对比**:
- Dart: FutureBuilder 模式清晰
- TypeScript: Composition API 更灵活

---

## 📊 性能对比

| 特性 | Dart | TypeScript |
|------|------|------------|
| **编译方式** | AOT（提前编译）或 JIT（即时编译） | 编译到 JavaScript |
| **运行时性能** | ⭐⭐⭐⭐⭐ 接近原生 | ⭐⭐⭐⭐ 取决于 JS 引擎 |
| **启动速度** | ⭐⭐⭐⭐ JIT 稍慢，AOT 快 | ⭐⭐⭐⭐⭐ 快 |
| **包体积** | ⭐⭐⭐⭐ 中等 | ⭐⭐⭐⭐⭐ 小（压缩后） |
| **热重载** | ⭐⭐⭐⭐⭐ 支持 | ⭐⭐⭐⭐ 支持（需要配置） |

---

## 🛠️ 开发工具对比

| 工具 | Dart | TypeScript |
|------|------|------------|
| **IDE 支持** | VS Code, Android Studio, IntelliJ | VS Code, WebStorm, 所有主流 IDE |
| **调试工具** | Dart DevTools | Chrome DevTools, VS Code Debugger |
| **代码格式化** | `dart format` | Prettier, ESLint |
| **类型检查** | 编译时检查 | 编译时检查 + 运行时可选 |
| **包管理** | pub.dev | npm/yarn/pnpm |

---

## 🎓 学习曲线

### Dart
- **优点**:
  - 语法简洁，易于学习
  - 官方文档完善
  - 类型系统清晰
- **缺点**:
  - 新语言，需要时间适应
  - 生态相对较小
  - 主要用于 Flutter

### TypeScript
- **优点**:
  - 基于 JavaScript，学习成本低
  - 生态非常成熟
  - 可以渐进式学习
- **缺点**:
  - 类型系统复杂（高级特性）
  - 需要理解 JavaScript 基础

---

## 💡 选择建议

### 选择 Dart，如果：
- ✅ 开发 Flutter 应用
- ✅ 需要最佳性能（AOT 编译）
- ✅ 喜欢简洁的语法
- ✅ 不介意学习新语言

### 选择 TypeScript，如果：
- ✅ 开发 Web/React/Vue 应用
- ✅ 团队熟悉 JavaScript
- ✅ 需要丰富的生态和库
- ✅ 希望代码可以运行在浏览器/Node.js

---

## 🔗 参考资源

### Dart
- 官方文档: https://dart.dev/
- Flutter 文档: https://flutter.dev/
- pub.dev: https://pub.dev/

### TypeScript
- 官方文档: https://www.typescriptlang.org/
- TypeScript Playground: https://www.typescriptlang.org/play
- DefinitelyTyped: https://github.com/DefinitelyTyped/DefinitelyTyped

---

## 📝 总结

| 维度 | Dart | TypeScript |
|------|------|------------|
| **语法简洁度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **类型安全** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **生态成熟度** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **学习曲线** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **性能** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **适用场景** | Flutter 移动开发 | Web/全栈开发 |

**最终建议**:
- 如果开发 **Flutter 应用** → 选择 **Dart**
- 如果开发 **Web/React/Vue 应用** → 选择 **TypeScript**
- 如果团队熟悉 **JavaScript** → 选择 **TypeScript**
- 如果追求 **最佳性能** → 选择 **Dart**
